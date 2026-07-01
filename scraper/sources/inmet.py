"""
Scraper de avisos meteorologicos do INMET.

Os avisos do INMET nao usam as keywords rodoviarias. Eles sao filtrados por
severidade e, opcionalmente, por tipo de evento, conforme config/sources.yaml.
"""
from datetime import datetime, timedelta
from time import sleep

import feedparser
import requests
from bs4 import BeautifulSoup

from scraper.sources import HEADERS
from scraper.utils.filters import build_summary

SEVERITY_ORDER = ["Perigo Potencial", "Perigo", "Grande Perigo"]
DEFAULT_SEVERITIES = ["Perigo", "Grande Perigo"]

INMET_TIMEOUT = (30, 60)
INMET_RETRIES = 3


def _parse_summary(summary_html: str) -> dict:
    soup = BeautifulSoup(summary_html, "lxml")
    fields = {}
    for tr in soup.find_all("tr"):
        th, td = tr.find("th"), tr.find("td")
        if th and td:
            fields[th.get_text(strip=True)] = td.get_text(" ", strip=True)
    return fields


def _fetch_feed(url: str) -> str:
    last_error = None
    for attempt in range(1, INMET_RETRIES + 1):
        try:
            response = requests.get(url, headers=HEADERS, timeout=INMET_TIMEOUT)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            last_error = exc
            if attempt < INMET_RETRIES:
                wait = attempt * 5
                print(f"    tentativa {attempt} falhou; nova tentativa em {wait}s")
                sleep(wait)
    raise last_error


def _parse_start(value: str) -> datetime | None:
    if not value:
        return None
    for parser in (
        lambda raw: datetime.fromisoformat(raw),
        lambda raw: datetime.strptime(raw, "%d/%m/%Y %H:%M"),
    ):
        try:
            return parser(value)
        except ValueError:
            continue
    return None


def scrape_inmet(source: dict, keywords: list | None = None) -> list:
    alerts = []
    severities = source.get("severities", DEFAULT_SEVERITIES)
    eventos = source.get("eventos")

    try:
        print(f"    Buscando: {source['url']}")
        feed = feedparser.parse(_fetch_feed(source["url"]))

        for entry in feed.entries:
            fields = _parse_summary(entry.get("summary", ""))
            evento = fields.get("Evento", "")
            severidade = fields.get("Severidade", "")
            inicio = fields.get("In\u00edcio", "")

            data_inicio = _parse_start(inicio)
            if data_inicio is not None:
                limite = datetime.now() - timedelta(days=3)
                if data_inicio < limite:
                    continue

            if severities and severidade not in severities:
                continue
            if eventos and evento not in eventos:
                continue

            title = f"{evento} - {severidade}"
            descricao = fields.get("Descri\u00e7\u00e3o", "")
            area = fields.get("\u00c1rea", "")
            # A area vem primeiro para nao ser cortada em resumos longos.
            summary = f"{area}. {descricao}" if area else descricao

            alerts.append(
                {
                    "title": title,
                    "url": entry.get("link", ""),
                    "source": source["name"],
                    "category": source.get("category", "clima"),
                    "published_at": inicio or entry.get("published", ""),
                    "summary": build_summary(title, summary),
                    "scraped_at": datetime.now().isoformat(),
                    "type": "INMET",
                }
            )
    except Exception as exc:
        print(f"    Erro ao processar '{source['name']}': {exc}")

    return alerts
