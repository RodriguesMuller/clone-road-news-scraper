import html
import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta

import psycopg
import requests

from scraper.utils.timezone import BRASILIA_TZ, brasilia_now

OPENAI_URL = "https://api.openai.com/v1/responses"
RESEND_URL = "https://api.resend.com/emails"
DEFAULT_MODEL = "gpt-4.1-mini"


def fetch_weekly_news(database_url: str, days: int = 7, limit: int = 250) -> list[dict]:
    since = brasilia_now() - timedelta(days=days)
    query = """
        SELECT title, url, source, category, published_at, summary, scraped_at, type, created_at
        FROM news
        WHERE created_at >= %s
        ORDER BY created_at DESC
        LIMIT %s;
    """

    with psycopg.connect(database_url, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(query, (since, limit))
            columns = [desc.name for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]


def _date_text(value) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        date = value.astimezone(BRASILIA_TZ) if value.tzinfo else value.replace(tzinfo=BRASILIA_TZ)
        return date.strftime("%d/%m/%Y %H:%M")
    return str(value)


def _plain(value) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def _road_from_text(text: str) -> str:
    match = re.search(
        r"\b((?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4})\b",
        text,
        flags=re.IGNORECASE,
    )
    return match.group(1).replace(" ", "-").upper() if match else ""


def build_weekly_context(items: list[dict], days: int = 7) -> dict:
    source_counts = Counter(_plain(item.get("source")) or "Sem fonte" for item in items)
    type_counts = Counter(_plain(item.get("type")) or "Noticia" for item in items)
    road_counts = Counter(
        road
        for item in items
        for road in [_road_from_text(f"{item.get('title', '')} {item.get('summary', '')}")]
        if road
    )

    compact_items = []
    for item in items[:120]:
        compact_items.append(
            {
                "title": _plain(item.get("title")),
                "source": _plain(item.get("source")),
                "type": _plain(item.get("type")),
                "published_at": _date_text(item.get("published_at")),
                "summary": _plain(item.get("summary"))[:700],
                "url": _plain(item.get("url")),
            }
        )

    return {
        "period_days": days,
        "generated_at": brasilia_now().strftime("%d/%m/%Y %H:%M"),
        "total": len(items),
        "sources": source_counts.most_common(12),
        "types": type_counts.most_common(8),
        "roads": road_counts.most_common(10),
        "items": compact_items,
    }


def fallback_summary(context: dict) -> dict:
    top_sources = ", ".join(f"{name} ({count})" for name, count in context["sources"][:4]) or "sem fontes recentes"
    top_roads = ", ".join(f"{road} ({count})" for road, count in context["roads"][:5]) or "sem rodovias identificadas"
    highlights = [
        item["title"]
        for item in context["items"][:5]
        if item.get("title")
    ]
    return {
        "headline": "Resumo semanal rodoviario",
        "executive_summary": (
            f"Foram identificados {context['total']} registros nos ultimos {context['period_days']} dias. "
            f"As fontes com maior volume foram {top_sources}. As rodovias mais citadas foram {top_roads}."
        ),
        "risk_level": "Atencao" if context["total"] else "Normal",
        "operational_points": highlights[:5],
        "critical_roads": [road for road, _count in context["roads"][:5]],
        "weather_notes": [
            item["title"]
            for item in context["items"]
            if item.get("type") == "INMET"
        ][:4],
        "recommendations": [
            "Monitorar as rodovias mais citadas antes do planejamento operacional.",
            "Priorizar ocorrencias com acidente, bloqueio, interdicao e alerta meteorologico.",
        ],
    }


def generate_ai_summary(context: dict, api_key: str | None = None, model: str | None = None) -> dict:
    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return fallback_summary(context)

    prompt = {
        "role": "user",
        "content": [
            {
                "type": "input_text",
                "text": (
                    "Analise os registros rodoviarios abaixo e gere um resumo semanal em JSON valido. "
                    "Foque em impacto operacional: rodovias criticas, acidentes, bloqueios, lentidao, clima, "
                    "estados/cidades citados e recomendacoes praticas. Nao invente fatos fora do contexto.\n\n"
                    f"{json.dumps(context, ensure_ascii=False, default=str)}"
                ),
            }
        ],
    }
    developer = {
        "role": "developer",
        "content": [
            {
                "type": "input_text",
                "text": (
                    "Voce e um analista operacional de risco rodoviario da Overhaul. "
                    "Responda somente com JSON contendo: headline, executive_summary, risk_level, "
                    "operational_points, critical_roads, weather_notes, recommendations. "
                    "Use portugues do Brasil, tom executivo e frases objetivas."
                ),
            }
        ],
    }
    response = requests.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model or os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
            "input": [developer, prompt],
            "max_output_tokens": 1600,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    text = data.get("output_text") or ""
    if not text:
        for output in data.get("output", []):
            for content in output.get("content", []):
                text += content.get("text", "")
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.IGNORECASE | re.MULTILINE).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        fallback = fallback_summary(context)
        fallback["executive_summary"] = text or fallback["executive_summary"]
        return fallback
    return {**fallback_summary(context), **parsed}


def render_weekly_email(summary: dict, context: dict) -> str:
    def esc(value):
        return html.escape(str(value or ""))

    points = "".join(f"<li>{esc(point)}</li>" for point in summary.get("operational_points", [])[:8])
    roads = "".join(f"<span class='pill'>{esc(road)}</span>" for road in summary.get("critical_roads", [])[:8])
    weather = "".join(f"<li>{esc(note)}</li>" for note in summary.get("weather_notes", [])[:6])
    recommendations = "".join(f"<li>{esc(item)}</li>" for item in summary.get("recommendations", [])[:6])
    source_rows = "".join(
        f"<tr><td>{esc(name)}</td><td align='right'><strong>{count}</strong></td></tr>"
        for name, count in context.get("sources", [])[:10]
    )

    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ margin:0; background:#eef3f0; color:#102019; font-family:Arial, Helvetica, sans-serif; }}
    .wrap {{ max-width:760px; margin:0 auto; padding:28px 18px; }}
    .hero {{ background:#0d1712; color:#f5fbf8; border-top:4px solid #12d981; padding:28px; }}
    .brand {{ font-weight:900; font-size:30px; letter-spacing:.04em; }}
    .brand:before {{ content:""; display:inline-block; border-left:18px solid transparent; border-right:18px solid transparent; border-top:28px solid #12d981; margin-right:12px; transform:translateY(6px); }}
    .sub {{ color:#12d981; font-weight:800; letter-spacing:.13em; font-size:13px; margin-top:6px; }}
    .card {{ background:#ffffff; border:1px solid #d7e4de; padding:22px; margin-top:16px; }}
    h1 {{ font-size:28px; margin:22px 0 8px; }}
    h2 {{ font-size:16px; letter-spacing:.08em; text-transform:uppercase; margin:0 0 14px; }}
    p, li, td {{ font-size:15px; line-height:1.55; }}
    .risk {{ display:inline-block; background:#12d981; color:#0d1712; padding:7px 12px; font-weight:900; border-radius:999px; margin-top:12px; }}
    .pill {{ display:inline-block; border:1px solid #12d981; color:#0d1712; padding:7px 10px; margin:0 8px 8px 0; border-radius:999px; font-weight:700; }}
    table {{ width:100%; border-collapse:collapse; }}
    td {{ border-bottom:1px solid #e6eee9; padding:8px 0; }}
    .foot {{ color:#5c6a63; font-size:12px; margin-top:18px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="brand">OVERHAUL</div>
      <div class="sub">ROAD NEWS · WEEKLY REPORT</div>
      <h1>{esc(summary.get("headline"))}</h1>
      <p>{esc(summary.get("executive_summary"))}</p>
      <div class="risk">Risco: {esc(summary.get("risk_level"))}</div>
    </div>
    <div class="card">
      <h2>Pontos Operacionais</h2>
      <ul>{points}</ul>
    </div>
    <div class="card">
      <h2>Rodovias Criticas</h2>
      <p>{roads or "Sem rodovias criticas identificadas no periodo."}</p>
    </div>
    <div class="card">
      <h2>Clima e INMET</h2>
      <ul>{weather or "<li>Sem alertas meteorologicos relevantes no periodo analisado.</li>"}</ul>
    </div>
    <div class="card">
      <h2>Recomendacoes</h2>
      <ul>{recommendations}</ul>
    </div>
    <div class="card">
      <h2>Fontes Monitoradas</h2>
      <table>{source_rows}</table>
    </div>
    <div class="foot">
      Gerado em {esc(context.get("generated_at"))}, com {context.get("total", 0)} registros dos ultimos {context.get("period_days", 7)} dias.
    </div>
  </div>
</body>
</html>"""


def send_resend_email(html_body: str, subject: str, api_key: str | None = None) -> dict:
    api_key = api_key or os.environ.get("RESEND_API_KEY")
    recipients = [
        email.strip()
        for email in os.environ.get("WEEKLY_EMAIL_TO", "").split(",")
        if email.strip()
    ]
    sender = os.environ.get("WEEKLY_EMAIL_FROM") or "Road News <onboarding@resend.dev>"
    if not api_key or not recipients:
        return {"sent": False, "reason": "RESEND_API_KEY or WEEKLY_EMAIL_TO not configured"}

    response = requests.post(
        RESEND_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"from": sender, "to": recipients, "subject": subject, "html": html_body},
        timeout=30,
    )
    response.raise_for_status()
    return {"sent": True, "response": response.json()}


def build_and_send_weekly_news(days: int = 7) -> dict:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL nao configurado")
    items = fetch_weekly_news(database_url, days=days)
    context = build_weekly_context(items, days=days)
    summary = generate_ai_summary(context)
    html_body = render_weekly_email(summary, context)
    subject = f"Overhaul Road News - resumo semanal ({context['generated_at']})"
    delivery = send_resend_email(html_body, subject)
    return {"summary": summary, "context": context, "delivery": delivery}
