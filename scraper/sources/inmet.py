"""
Scraper de avisos meteorológicos do INMET.

Diferente das fontes de notícias, os avisos do INMET NÃO são filtrados pelas
keywords rodoviárias (que nunca casariam com 'Tempestade', 'Geada' etc.). O
objetivo aqui é capturar clima severo que impacta as rodovias, então o filtro
é por SEVERIDADE (e, opcionalmente, por tipo de evento) — ambos configuráveis
no config/sources.yaml.

O feed RSS traz, em cada item, uma tabela HTML no campo <summary> com os
campos: Status, Evento, Severidade, Início, Fim, Descrição, Área e Link Gráfico.
"""
from datetime import datetime, timedelta

import requests
import feedparser
from bs4 import BeautifulSoup

from scraper.sources import HEADERS

# Severidades possíveis, da menor para a maior gravidade.
SEVERITY_ORDER = ["Perigo Potencial", "Perigo", "Grande Perigo"]

# Padrão: ignora o nível mais baixo ("Perigo Potencial") para reduzir ruído.
DEFAULT_SEVERITIES = ["Perigo", "Grande Perigo"]


def _parse_summary(summary_html: str) -> dict:
    """Extrai os pares campo→valor da tabela HTML do aviso."""
    soup = BeautifulSoup(summary_html, "lxml")
    fields = {}
    for tr in soup.find_all("tr"):
        th, td = tr.find("th"), tr.find("td")
        if th and td:
            fields[th.get_text(strip=True)] = td.get_text(" ", strip=True)
    return fields


def scrape_inmet(source: dict, keywords: list | None = None) -> list:
    """
    Coleta avisos meteorológicos do INMET, filtrando por severidade.

    Args:
        source: dict do sources.yaml. Campos relevantes:
            - url: feed RSS de avisos
            - severities: lista de severidades a incluir (default: Perigo +
              Grande Perigo)
            - eventos: (opcional) lista de tipos de evento a incluir; se
              omitido, todos os eventos da severidade escolhida são mantidos
        keywords: ignorado (mantido por compatibilidade de assinatura)

    Returns:
        Lista de dicionários padronizados de aviso.
    """
    alerts = []
    severities = source.get("severities", DEFAULT_SEVERITIES)
    eventos = source.get("eventos")  # None = todos

    try:
        print(f"    → Buscando: {source['url']}")
        resp = requests.get(source["url"], headers=HEADERS, timeout=20)
        resp.raise_for_status()
        feed = feedparser.parse(resp.text)

        for entry in feed.entries:
            print("INMET:", entry.get("title"), entry.get("published"))
            fields = _parse_summary(entry.get("summary", ""))
            evento = fields.get("Evento", "")
            severidade = fields.get("Severidade", "")

            inicio = fields.get("Início", "")
            data_inicio = None
            if inicio:
                try:
                    data_inicio = datetime.fromisoformat(inicio)
                except ValueError:
                    try:
                        data_inicio = datetime.strptime(inicio, "%d/%m/%Y %H:%M")
                    except ValueError:
                        data_inicio = None

            if data_inicio is not None:
                limite = datetime.now() - timedelta(days=3)
                if data_inicio < limite:
                    continue

            if severities and severidade not in severities:
                continue
            if eventos and evento not in eventos:
                continue

            descricao = fields.get("Descrição", "")
            area = fields.get("Área", "")
            summary = f"{descricao} {area}".strip()

            alerts.append(
                {
                    "title": f"{evento} — {severidade}",
                    "url": entry.get("link", ""),
                    "source": source["name"],
                    "category": source.get("category", "clima"),
                    "published_at": fields.get("Início", "") or entry.get("published", ""),
                    "summary": summary[:500],
                    "scraped_at": datetime.now().isoformat(),
                    "type": "INMET",
                }
            )

    except Exception as e:
        print(f"    ✗ Erro ao processar '{source['name']}': {e}")

    return alerts
