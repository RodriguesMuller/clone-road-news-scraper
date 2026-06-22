#!/usr/bin/env python3
"""
Road News Scraper — ponto de entrada.
Executa o scraping de todas as fontes em config/sources.yaml
e persiste os resultados em um banco PostgreSQL (Supabase).
"""
import os
import sys

import yaml
from dotenv import load_dotenv

from scraper.sources.html import HTML_SCRAPERS
from scraper.sources.rss import scrape_rss
from scraper.sources.inmet import scrape_inmet
from scraper.storage.postgres import save_to_postgres

# Garante saída UTF-8 no console (Windows usa cp1252 por padrão, que
# não suporta os caracteres Unicode usados nos prints abaixo).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

load_dotenv()  # carrega .env se rodar localmente


def load_config(path: str = "config/sources.yaml") -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def run() -> None:
    print("=" * 50)
    print("  Road News Scraper")
    print("=" * 50)

    config = load_config()
    keywords: list = config.get("keywords", [])
    all_news: list = []

    # ── RSS ──────────────────────────────────────────────
    rss_sources = config.get("rss_sources", [])
    print(f"\n[RSS] {len(rss_sources)} fonte(s) configurada(s)")
    for source in rss_sources:
        print(f"  • {source['name']}")
        items = scrape_rss(source, keywords)
        print(f"    ✓ {len(items)} notícia(s) encontrada(s)")
        all_news.extend(items)

    # ── HTML ─────────────────────────────────────────────
    html_sources = config.get("html_sources", [])
    print(f"\n[HTML] {len(html_sources)} fonte(s) configurada(s)")
    for source in html_sources:
        print(f"  • {source['name']}")
        scraper_fn = HTML_SCRAPERS.get(source.get("type", ""))
        if not scraper_fn:
            print(f"    ✗ Scraper não encontrado para type='{source.get('type')}'")
            continue
        items = scraper_fn(source, keywords)
        print(f"    ✓ {len(items)} notícia(s) encontrada(s)")
        all_news.extend(items)

    # ── INMET (avisos meteorológicos) ────────────────────
    inmet_sources = config.get("inmet_sources", [])
    print(f"\n[INMET] {len(inmet_sources)} fonte(s) configurada(s)")
    for source in inmet_sources:
        print(f"  • {source['name']}")
        items = scrape_inmet(source)
        print(f"    ✓ {len(items)} aviso(s) relevante(s)")
        all_news.extend(items)

    print(f"\n[Total] {len(all_news)} notícia(s) coletada(s)")

    # ── Storage ──────────────────────────────────────────
    database_url = os.environ.get("DATABASE_URL")

    if not database_url:
        print("\n[Aviso] DATABASE_URL não definido.")
        print("        Exibindo resultados no terminal:\n")
        for item in all_news:
            print(f"  [{item['source']}] {item['title']}")
            print(f"  {item['url']}\n")
        sys.exit(0)

    if all_news:
        new_count = save_to_postgres(all_news, database_url)
        print(f"[Postgres] {new_count} novo(s) registro(s) salvo(s).")
    else:
        print("[Postgres] Nenhuma notícia nova para salvar.")

    print("\nConcluído.")


if __name__ == "__main__":
    run()
