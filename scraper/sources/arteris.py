"""
Scraper das ocorrências em tempo real das rodovias da Arteris (API JSON).

A página `/nossas-rodovias/<slug>/em-tempo-real/` é uma SPA que consome a API
pública `https://www.arteris.com.br/api/mapa-interativo/<slug>` (ex.: fluminense).
O JSON traz `rodovias[]`, cada uma com `trechos_homogeneos_trafego[]` e, dentro,
`trafego[]` — as ocorrências (obras, acidentes, congestionamento) com `tipo`,
`descricao`, `km_inicio`, `km_fim`.

Diferenças em relação às fontes de notícia:
  • NÃO usa as keywords (toda ocorrência em rodovia já é relevante);
  • não há URL/ID por ocorrência, então geramos uma chave estável (hash do
    conteúdo) para deduplicar — o resultado funciona como um LOG de ocorrências.

Config esperada no sources.yaml (em html_sources, type: arteris):
    url:      endpoint da API (…/api/mapa-interativo/<slug>)
    page_url: página pública (usada como Referer e como link da ocorrência)
"""
import hashlib
from datetime import datetime

import requests

from scraper.sources import HEADERS
from scraper.utils.filters import build_summary, extract_region, clean_text


def scrape_arteris(source: dict, keywords=None) -> list:
    """Coleta ocorrências de tráfego da API da Arteris (ignora keywords)."""
    items = []
    page_url = source.get("page_url", source["url"])
    headers = {**HEADERS, "Accept": "application/json", "Referer": page_url}

    try:
        print(f"    → Buscando: {source['url']}")
        resp = requests.get(source["url"], headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"    ✗ Erro ao processar '{source['name']}': {e}")
        return items

    now = datetime.now().isoformat()
    for rod in data.get("rodovias", []):
        rod_nome = rod.get("nome", "") or data.get("nome", "")
        for trecho in rod.get("trechos_homogeneos_trafego", []):
            for oc in trecho.get("trafego", []):
                desc = clean_text(oc.get("descricao", ""))
                if not desc:
                    continue
                tipo = clean_text(oc.get("tipo", "")) or "Ocorrência"
                km_i, km_f = oc.get("km_inicio"), oc.get("km_fim")
                trecho_str = ""
                if km_i is not None and km_f is not None:
                    trecho_str = f" (km {km_i}–{km_f})"

                title = f"{tipo}{trecho_str}: {desc}"[:300]
                summary_source = f"{rod_nome}: {desc}" if rod_nome else desc
                # Sem ID/URL por ocorrência: chave estável a partir do conteúdo.
                raw = f"{rod_nome}|{km_i}|{km_f}|{tipo}|{desc}"
                key = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]

                region = extract_region(title, summary_source, rod_nome, page_url)
                items.append(
                    {
                        "title": title,
                        "url": f"{page_url}#{key}",
                        "source": source["name"],
                        "category": source.get("category", "rodovia"),
                        "published_at": now,
                        "summary": build_summary(title, summary_source, rod_nome, region=region),
                        "region": region,
                        "scraped_at": now,
                        "type": "ARTERIS",
                    }
                )

    return items
