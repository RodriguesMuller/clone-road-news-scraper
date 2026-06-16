import feedparser
from datetime import datetime

from scraper.utils.filters import matches_keywords, clean_text


def scrape_rss(source: dict, keywords: list) -> list:
    """
    Faz scraping de uma fonte RSS e retorna notícias filtradas por keywords.

    Args:
        source: dicionário com 'name', 'url' e 'category' (do sources.yaml)
        keywords: lista de termos para filtro

    Returns:
        Lista de dicionários com os campos padronizados da notícia
    """
    news = []

    try:
        print(f"    → Buscando: {source['url']}")
        feed = feedparser.parse(source["url"])

        if feed.bozo:
            print(f"    ⚠ Feed malformado em '{source['name']}' — tentando mesmo assim")

        for entry in feed.entries:
            title = clean_text(entry.get("title", ""))
            summary = clean_text(entry.get("summary", entry.get("description", "")))

            if not matches_keywords(f"{title} {summary}", keywords):
                continue

            # Normaliza a data de publicação
            try:
                pub_dt = (
                    datetime(*entry.published_parsed[:6]).isoformat()
                    if hasattr(entry, "published_parsed") and entry.published_parsed
                    else entry.get("published", "")
                )
            except Exception:
                pub_dt = entry.get("published", "")

            news.append(
                {
                    "title": title,
                    "url": entry.get("link", ""),
                    "source": source["name"],
                    "category": source.get("category", ""),
                    "published_at": pub_dt,
                    "summary": summary[:500],
                    "scraped_at": datetime.now().isoformat(),
                    "type": "RSS",
                }
            )

    except Exception as e:
        print(f"    ✗ Erro ao processar '{source['name']}': {e}")

    return news
