"""
Persistência em PostgreSQL (Supabase).

A deduplicação é feita pelo próprio banco: a coluna `url` tem constraint
UNIQUE e o INSERT usa `ON CONFLICT (url) DO NOTHING`, então registros já
existentes são ignorados sem erro. `cur.rowcount` indica se a linha foi
inserida (1) ou ignorada (0).

Conexão via variável de ambiente DATABASE_URL — use a connection string do
"Session pooler" do Supabase (compatível com IPv4, exigido pelo GitHub Actions).
"""
import psycopg

# Mantém a mesma ordem/contrato de colunas usado pelos scrapers.
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

INSERT = """
INSERT INTO news (title, url, source, category, published_at, summary, scraped_at, type)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (url) DO NOTHING;
"""


def save_to_postgres(news_items: list, database_url: str) -> int:
    """
    Salva notícias no PostgreSQL, evitando duplicatas por URL.

    Args:
        news_items: lista de dicionários com as notícias coletadas
        database_url: connection string do Postgres (DATABASE_URL)

    Returns:
        Número de novos registros inseridos
    """
    # Remove itens sem URL (não dá pra deduplicar) e dups dentro do mesmo lote.
    seen: set = set()
    rows = []
    for item in news_items:
        url = item.get("url", "")
        if not url or url in seen:
            continue
        seen.add(url)
        rows.append(tuple(item.get(col, "") for col in COLUMNS))

    if not rows:
        return 0

    # prepare_threshold=None desativa prepared statements no servidor — evita
    # incompatibilidade caso a connection string seja a do Transaction pooler.
    with psycopg.connect(database_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE)
            new_count = 0
            for row in rows:
                cur.execute(INSERT, row)
                new_count += cur.rowcount  # 1 se inseriu, 0 se já existia
        conn.commit()

    return new_count
