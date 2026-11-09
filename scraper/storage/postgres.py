"""
Persistencia em PostgreSQL (Supabase).

A deduplicacao e feita pelo banco pela coluna `url`. Campos de IA sao
opcionais: o scraper so tenta usa-los quando a migration ja existe.
"""
import os

import psycopg

from scraper.utils.image_summary import build_image_summary_fallback, generate_image_summary, should_use_ai_for_image_summary

COLUMNS = [
    "title",
    "url",
    "source",
    "category",
    "published_at",
    "summary",
    "scraped_at",
    "type",
]

AI_COLUMNS = [
    "image_summary",
    "ai_summary",
    "operational_relevance",
    "operational_impact",
    "ai_processed_at",
    "ai_model",
    "region",
    "country",
    "state",
    "city",
    "highway",
    "risk_level",
]

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS news (
    id           BIGSERIAL PRIMARY KEY,
    title        TEXT NOT NULL,
    url          TEXT NOT NULL UNIQUE,
    source       TEXT,
    category     TEXT,
    published_at TEXT,
    summary      TEXT,
    scraped_at   TEXT,
    type         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

# Leitura da tabela news e feita so pelo backend (service role, em api/news-feed.js).
# O scraper NAO recria mais a policy "Allow public read news": ela expunha a tabela
# inteira a qualquer pessoa com a chave publica do frontend, sem login nem cota.
# Ver scripts/supabase_security_hardening.sql.


def _table_columns(cur) -> set[str]:
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'news';
        """
    )
    return {row[0] for row in cur.fetchall()}


def _existing_urls(cur, urls: list[str]) -> set[str]:
    if not urls:
        return set()
    cur.execute("SELECT url FROM news WHERE url = ANY(%s)", (urls,))
    return {row[0] for row in cur.fetchall()}


def _insert_sql(columns: list[str]) -> str:
    names = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    return f"INSERT INTO news ({names}) VALUES ({placeholders}) ON CONFLICT (url) DO NOTHING;"


def _with_image_summary(item: dict, available_columns: set[str]) -> dict:
    if "image_summary" not in available_columns or item.get("image_summary"):
        return item

    use_ai = str(os.environ.get("SCRAPER_AI_SUMMARIES_ENABLED", "true")).lower() in {"1", "true", "yes"}
    ai_data = (
        generate_image_summary(item)
        if use_ai and should_use_ai_for_image_summary(item)
        else build_image_summary_fallback(item)
    )
    if ai_data.get("image_summary"):
        ai_data["ai_summary"] = ai_data["image_summary"]
    enriched = {**item}
    for key in AI_COLUMNS:
        if key in available_columns and ai_data.get(key) is not None:
            enriched[key] = ai_data[key]
    if "category" in available_columns and ai_data.get("category"):
        enriched["category"] = ai_data["category"]
    return enriched


def save_to_postgres(news_items: list, database_url: str) -> int:
    """
    Salva noticias no PostgreSQL, evitando duplicatas por URL.
    """
    seen: set = set()
    unique_items = []
    for item in news_items:
        url = item.get("url", "")
        if not url or url in seen:
            continue
        seen.add(url)
        unique_items.append(item)

    if not unique_items:
        return 0

    with psycopg.connect(database_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE)
            available_columns = _table_columns(cur)
            insert_columns = [column for column in COLUMNS + AI_COLUMNS if column in available_columns]
            insert_sql = _insert_sql(insert_columns)
            existing_urls = _existing_urls(cur, [item.get("url", "") for item in unique_items])

            new_count = 0
            for item in unique_items:
                if item.get("url") in existing_urls:
                    continue
                enriched = _with_image_summary(item, available_columns)
                row = tuple(enriched.get(col, "") for col in insert_columns)
                cur.execute(insert_sql, row)
                new_count += cur.rowcount
        conn.commit()

    return new_count
