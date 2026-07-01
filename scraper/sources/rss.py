import feedparser
import requests
from datetime import datetime

from scraper.sources import HEADERS
from scraper.utils.filters import build_summary, extract_region, matches_keywords, clean_text


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
        # Busca via requests com User-Agent de navegador. Vários portais (G1,
        # CNN) limitam/bloqueiam o User-Agent padrão do feedparser e IPs de
        # datacenter (como os do GitHub Actions); o cabeçalho de navegador
        # reduz esse bloqueio. Cai no feedparser direto se a requisição falhar.
        try:
            resp = requests.get(source["url"], headers=HEADERS, timeout=20)
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)
        except Exception as fetch_err:
            print(f"    ⚠ Falha ao buscar via requests ({fetch_err}); tentando feedparser direto")
            feed = feedparser.parse(source["url"])

        if feed.bozo:
            print(f"    ⚠ Feed malformado em '{source['name']}' — tentando mesmo assim")

        for entry in feed.entries:
            title = clean_text(entry.get("title", ""))
            summary = clean_text(entry.get("summary", entry.get("description", "")))

            # Filtrar apenas pelo título (não pelo resumo) conforme solicitado
            if not matches_keywords(title, keywords):
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
                    "summary": build_summary(title, summary),
                    "region": extract_region(title, summary, source["name"], entry.get("link", "")),
                    "scraped_at": datetime.now().isoformat(),
                    "type": "RSS",
                }
            )

    except Exception as e:
        print(f"    ✗ Erro ao processar '{source['name']}': {e}")

    return news
