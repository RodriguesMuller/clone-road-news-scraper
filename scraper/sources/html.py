import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from scraper.sources import HEADERS
from scraper.utils.filters import matches_keywords, clean_text


def _get_soup(url: str, timeout: int = 15) -> BeautifulSoup | None:
    """Faz a requisição HTTP e retorna o BeautifulSoup, ou None em caso de erro."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        print(f"    ✗ Erro ao acessar {url}: {e}")
        return None


def _build_item(title: str, url: str, summary: str, source: dict,
                published_at: str | None = None) -> dict:
    """Cria um dicionário padronizado de notícia."""
    now = datetime.now().isoformat()
    return {
        "title": title,
        "url": url,
        "source": source["name"],
        "category": source.get("category", ""),
        "published_at": published_at or now,
        "summary": (summary or "")[:500],
        "scraped_at": now,
        "type": "HTML",
    }

def scrape_prf(source: dict, keywords) -> list:
    """Scraping das notícias da PRF."""

    news = []

    soup = _get_soup(source["url"])

    if not soup:
        return news

    seen = set()

    for a in soup.find_all("a", href=True):

        href = a.get("href", "")

        if "/noticias/" not in href:
            continue

        title = clean_text(a.get_text())

        if not title:
            continue

        if len(title) < 15:
            continue

        if href.startswith("/"):
            href = "https://www.gov.br" + href

        if href in seen:
            continue

        seen.add(href)

        summary = ""

        parent = a.parent
        if parent:
            summary = clean_text(parent.get_text())

        # Filtrar apenas pelo título (não pelo resumo) conforme solicitado
        if matches_keywords(title, keywords):
            news.append(
                _build_item(
                    title=title,
                    url=href,
                    summary=summary,
                    source=source,
                )
            )

    return news

# ---------------------------------------------------------------
# Band — portal de notícias (band.com.br)
# ---------------------------------------------------------------
# O site é uma SPA Next.js renderizada no servidor: o HTML inicial já
# contém os links de notícia. Cada URL termina em um timestamp de 12
# dígitos (AAAAMMDDHHMM), de onde extraímos a data de publicação.
_BAND_URL_RE = re.compile(r"/noticias/.+-(\d{12})$")


def scrape_band(source: dict, keywords: list) -> list:
    """Scraping do portal de notícias da Band."""
    news = []
    soup = _get_soup(source["url"])
    if not soup:
        return news

    seen: set = set()
    for a in soup.find_all("a", href=True):
        match = _BAND_URL_RE.search(a["href"])
        if not match:
            continue

        url = a["href"]
        if not url.startswith("http"):
            url = "https://www.band.com.br" + url
        if url in seen:
            continue
        seen.add(url)

        # Título: prioriza heading interno, depois alt da imagem, por fim o
        # texto do link (que pode vir com prefixo de seção, então o limpamos).
        raw_text = clean_text(a.get_text())
        title = ""
        head = a.find(["h1", "h2", "h3", "h4"])
        if head:
            title = clean_text(head.get_text())
        if not title:
            img = a.find("img", alt=True)
            if img:
                title = clean_text(img["alt"])
        if not title:
            title = raw_text
        if not title:
            continue

        summary = ""
        if raw_text and raw_text != title:
            summary = raw_text.replace(title, "", 1).strip()

        # Data de publicação a partir do timestamp na URL (AAAAMMDDHHMM)
        ts = match.group(1)
        try:
            published_at = datetime(
                int(ts[0:4]), int(ts[4:6]), int(ts[6:8]),
                int(ts[8:10]), int(ts[10:12]),
            ).isoformat()
        except ValueError:
            published_at = ""

        # Filtrar apenas pelo título (não pelo resumo) conforme solicitado
        if matches_keywords(title, keywords):
            news.append(_build_item(title, url, summary, source, published_at))

    return news


# ---------------------------------------------------------------
# Registro de scrapers HTML disponíveis
# Adicione novas fontes aqui e mapeie o campo "type" no sources.yaml
# ---------------------------------------------------------------
HTML_SCRAPERS = {
    "band": scrape_band,
    "prf": scrape_prf,
}
