"""Imagem de compartilhamento (og:image / twitter:image) da página da notícia.

Usada só para notícias NOVAS de fontes diretas, quando o feed não trouxe imagem.
Links do Google News são redirecionamentos (news.google.com/rss/articles/...) e não
são buscados. Um GET com timeout curto por notícia, com teto por execução.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

import requests

from scraper.sources import HEADERS
from scraper.utils.filters import safe_image_url

_META = re.compile(
    r"<meta[^>]+(?:property|name)=[\"'](?:og:image(?::secure_url)?|twitter:image(?::src)?)[\"'][^>]*>",
    re.IGNORECASE,
)
_CONTENT = re.compile(r"content=[\"']([^\"']+)[\"']", re.IGNORECASE)
_SKIP_HOSTS = ("news.google.com",)


def can_fetch_og_image(url: str) -> bool:
    host = urlparse(str(url or "")).netloc.lower()
    return bool(host) and not any(host == h or host.endswith("." + h) for h in _SKIP_HOSTS)


def og_image_from_html(page_html: str, page_url: str = "") -> str:
    for tag in _META.finditer(page_html or ""):
        content = _CONTENT.search(tag.group(0))
        if content:
            candidate = safe_image_url(urljoin(page_url, content.group(1)), assume_image=True)
            if candidate:
                return candidate
    return ""


def fetch_og_image(url: str, timeout: int = 8) -> str:
    if not can_fetch_og_image(url):
        return ""
    try:
        response = requests.get(url, headers=HEADERS, timeout=timeout, stream=True)
        response.raise_for_status()
        if "html" not in response.headers.get("content-type", ""):
            return ""
        # O <head> basta: lê no máximo ~200 KB.
        chunk = response.raw.read(200_000, decode_content=True) or b""
        return og_image_from_html(chunk.decode(response.encoding or "utf-8", errors="ignore"), response.url)
    except Exception:
        return ""
