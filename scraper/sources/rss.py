import feedparser
import requests
from datetime import datetime, timezone

from scraper.sources import HEADERS
from scraper.utils.filters import build_summary, matches_keywords, clean_text, is_blocked_url, is_fleet_relevant, safe_image_url, first_image_in_html


def extract_image_url(entry) -> str:
    """Imagem que a própria fonte publica no feed (sem baixar a página da notícia)."""
    for media in entry.get("media_content", []) or []:
        medium = str(media.get("medium") or media.get("type") or "")
        if medium.startswith("image") or medium == "":
            url = safe_image_url(media.get("url"), assume_image=medium.startswith("image"))
            if url:
                return url
    for thumb in entry.get("media_thumbnail", []) or []:
        url = safe_image_url(thumb.get("url"), assume_image=True)
        if url:
            return url
    for link in list(entry.get("enclosures", []) or []) + list(entry.get("links", []) or []):
        if str(link.get("type") or "").startswith("image") or link.get("rel") == "enclosure":
            url = safe_image_url(link.get("href") or link.get("url"), assume_image=str(link.get("type") or "").startswith("image"))
            if url:
                return url
    contents = [c.get("value", "") for c in entry.get("content", []) or []]
    for fragment in [entry.get("summary", ""), entry.get("description", ""), *contents]:
        url = first_image_in_html(fragment)
        if url:
            return url
    return ""
from scraper.utils.timezone import brasilia_iso_from_datetime, brasilia_now_iso


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
            # Segunda tentativa com o User-Agent padrao do feedparser, mas ainda via requests
            # para ter timeout: feedparser.parse(url) usa urllib sem timeout e podia prender o
            # job ate o limite de 15 min do GitHub Actions.
            print(f"    ⚠ Falha ao buscar via requests ({fetch_err}); tentando com User-Agent do feedparser")
            fallback = requests.get(source["url"], headers={"User-Agent": feedparser.USER_AGENT}, timeout=20)
            fallback.raise_for_status()
            feed = feedparser.parse(fallback.content)

        if feed.bozo:
            print(f"    ⚠ Feed malformado em '{source['name']}' — tentando mesmo assim")

        is_google_news_aggregator = source["name"].startswith("Google News")

        for entry in feed.entries:
            title = clean_text(entry.get("title", ""))
            summary = clean_text(entry.get("summary", entry.get("description", "")))
            link = entry.get("link", "")

            # Google News RSS expõe o veículo real via entry.source.title (e o
            # título original vem sufixado com "- Veículo"). Sem isso, o card
            # do cliente mostra "Google News - <query de busca>" como se fosse
            # a fonte editorial, o que derruba a credibilidade do dado.
            outlet_name = source["name"]
            if is_google_news_aggregator:
                google_source = getattr(entry, "source", None) or entry.get("source")
                outlet_title = (
                    google_source.get("title") if isinstance(google_source, dict) else getattr(google_source, "title", None)
                )
                if outlet_title:
                    outlet_name = clean_text(outlet_title)
                elif " - " in title:
                    title, _, suffix = title.rpartition(" - ")
                    outlet_name = clean_text(suffix) or outlet_name

            if is_blocked_url(link):
                continue

            # Fontes especializadas podem ter uma lista própria sem ampliar o
            # filtro das demais notícias nacionais.
            source_keywords = source.get("keywords") or keywords
            if not matches_keywords(title, source_keywords):
                continue
            # Só guarda o que ajuda o gestor de frota a decidir rota/horário:
            # contexto viário + sinal de impacto. Fontes com fleet_filter: false
            # (ex.: corredores internacionais) mantêm apenas o filtro próprio.
            if source.get("fleet_filter", True) and not is_fleet_relevant(title, summary):
                continue

            # Normaliza a data de publicação
            try:
                pub_dt = (
                    brasilia_iso_from_datetime(datetime(*entry.published_parsed[:6], tzinfo=timezone.utc))
                    if hasattr(entry, "published_parsed") and entry.published_parsed
                    else entry.get("published", "")
                )
            except Exception:
                pub_dt = entry.get("published", "")

            news.append(
                {
                    "title": title,
                    "url": entry.get("link", ""),
                    "source": outlet_name,
                    "category": source.get("category", ""),
                    "published_at": pub_dt,
                    "summary": build_summary(title, summary),
                    "scraped_at": brasilia_now_iso(),
                    "type": "RSS",
                    "image_url": extract_image_url(entry),
                }
            )
            if source.get("max_items") and len(news) >= int(source["max_items"]):
                break

    except Exception as e:
        print(f"    ✗ Erro ao processar '{source['name']}': {e}")

    return news
