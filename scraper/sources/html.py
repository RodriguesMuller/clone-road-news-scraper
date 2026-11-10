import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from scraper.sources import HEADERS
from scraper.sources.arteris import scrape_arteris
from scraper.utils.filters import build_summary, matches_keywords, clean_text, is_fleet_relevant, safe_image_url, strip_section_prefix
from scraper.utils.timezone import brasilia_iso_from_datetime, brasilia_now_iso


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
                published_at: str | None = None, image_url: str = "") -> dict:
    """Cria um dicionário padronizado de notícia."""
    now = brasilia_now_iso()
    return {
        "title": title,
        "url": url,
        "source": source["name"],
        "category": source.get("category", ""),
        "published_at": published_at or now,
        "summary": build_summary(title, summary),
        "scraped_at": now,
        "type": "HTML",
        "image_url": image_url,
    }

# ---------------------------------------------------------------
# Band — portal de notícias (band.com.br)
# ---------------------------------------------------------------
# O site é uma SPA Next.js renderizada no servidor: o HTML inicial já
# contém os links de notícia. Cada URL termina em um timestamp de 12
# dígitos (AAAAMMDDHHMM), de onde extraímos a data de publicação.
# Formato antigo: /noticias/<slug>-AAAAMMDDHHMM. Desde ~out/2026 a Band publica so
# /noticias/<slug> (sem timestamp), o que zerava a coleta silenciosamente. Exige slug
# com 4+ palavras para nao pegar paginas de editoria (/noticias/brasil).
_BAND_URL_RE = re.compile(r"/noticias/(?:[a-z0-9]+-){3,}?[a-z0-9]+?(?:-(\d{12}))?/?$")


def _extract_band_summary(url: str) -> str:
    """Tenta extrair o resumo de uma notícia da Band a partir da página do artigo."""
    soup = _get_soup(url)
    if not soup:
        return ""

    article = soup.find("article")
    if article:
        # A Band rendeirza o corpo da notícia dentro de um <article> e usa
        # parágrafos para o texto principal. Extraímos o texto desses parágrafos
        # para obter o resumo completo do artigo.
        body = article.find("div", class_=lambda value: value and "space-y" in value)
        if body:
            paragraphs = [
                p.get_text(" ", strip=True)
                for p in body.find_all("p")
                if p.get_text(strip=True)
            ]
            if paragraphs:
                return clean_text(" ".join(paragraphs))

        paragraphs = [
            p.get_text(" ", strip=True)
            for p in article.find_all("p")
            if p.get_text(strip=True)
        ]
        if paragraphs:
            return clean_text(" ".join(paragraphs))

    for attrs in (
        {"name": "description"},
        {"property": "og:description"},
        {"name": "twitter:description"},
    ):
        meta = soup.find("meta", attrs=attrs)
        if meta and meta.get("content"):
            return clean_text(meta["content"])

    first_p = soup.find("p")
    if first_p:
        return clean_text(first_p.get_text(" ", strip=True))

    return ""


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
            title = strip_section_prefix(clean_text(head.get_text()))
        if not title:
            img = a.find("img", alt=True)
            if img:
                title = clean_text(img["alt"])
        if not title:
            title = raw_text

        # Imagem da própria listagem do portal (src, data-src ou primeira do srcset).
        image_url = ""
        tag = a.find("img")
        if tag:
            candidate = tag.get("src") or tag.get("data-src") or (tag.get("srcset") or "").split(" ")[0]
            image_url = safe_image_url(candidate, assume_image=True)
        if not title:
            continue

        # Data de publicação a partir do timestamp na URL (AAAAMMDDHHMM)
        # Sem timestamp na URL (formato novo): fica vazio em vez de inventar uma data.
        ts = match.group(1)
        published_at = ""
        if ts:
            try:
                published_at = brasilia_iso_from_datetime(datetime(
                    int(ts[0:4]), int(ts[4:6]), int(ts[6:8]),
                    int(ts[8:10]), int(ts[10:12]),
                ))
            except ValueError:
                published_at = ""

        # Filtrar apenas pelo título (não pelo resumo) conforme solicitado
        if matches_keywords(title, keywords):
            summary = _extract_band_summary(url)
            if not is_fleet_relevant(title, summary):
                continue
            news.append(_build_item(title, url, summary, source, published_at, image_url))

    return news


# ---------------------------------------------------------------
# Registro de scrapers HTML disponíveis
# Adicione novas fontes aqui e mapeie o campo "type" no sources.yaml
# ---------------------------------------------------------------
HTML_SCRAPERS = {
    "band": scrape_band,
    "arteris": scrape_arteris,
}
