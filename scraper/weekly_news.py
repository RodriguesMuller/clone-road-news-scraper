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
    text = re.sub(r"<[^>]+>", " ", html.unescape(str(value or "").replace("&nbsp&nbsp", " ")))
    return re.sub(r"\s+", " ", text).strip()


def _road_from_text(text: str) -> str:
    match = re.search(
        r"\b((?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4})\b",
        text,
        flags=re.IGNORECASE,
    )
    return match.group(1).replace(" ", "-").upper() if match else ""


STATES = [
    ("Acre", "AC"), ("Alagoas", "AL"), ("Amapa", "AP"), ("Amazonas", "AM"), ("Bahia", "BA"),
    ("Ceara", "CE"), ("Distrito Federal", "DF"), ("Espirito Santo", "ES"), ("Goias", "GO"),
    ("Maranhao", "MA"), ("Mato Grosso", "MT"), ("Mato Grosso do Sul", "MS"), ("Minas Gerais", "MG"),
    ("Para", "PA"), ("Paraiba", "PB"), ("Parana", "PR"), ("Pernambuco", "PE"), ("Piaui", "PI"),
    ("Rio de Janeiro", "RJ"), ("Rio Grande do Norte", "RN"), ("Rio Grande do Sul", "RS"),
    ("Rondonia", "RO"), ("Roraima", "RR"), ("Santa Catarina", "SC"), ("Sao Paulo", "SP"),
    ("Sergipe", "SE"), ("Tocantins", "TO"),
]


def _match_text(value: str) -> str:
    normalized = _plain(value).lower()
    return (
        normalized.replace("á", "a").replace("à", "a").replace("ã", "a").replace("â", "a")
        .replace("é", "e").replace("ê", "e").replace("í", "i").replace("ó", "o")
        .replace("ô", "o").replace("õ", "o").replace("ú", "u").replace("ç", "c")
    )


def _region_from_text(text: str) -> str:
    raw = _plain(text)
    city_uf = re.search(r"\b([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç.'-]+(?:\s+[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç.'-]+){0,3})/([A-Z]{2})\b", raw)
    if city_uf:
        return f"{city_uf.group(1)}/{city_uf.group(2)}"
    normalized = _match_text(raw)
    for name, uf in STATES:
        if _match_text(name) in normalized:
            return name
        if re.search(rf"\b{uf}\b", raw):
            return uf
    return ""


def _category_from_item(item: dict) -> str:
    explicit = _plain(item.get("category"))
    if explicit and explicit.lower() != "noticia":
        return explicit
    text = _match_text(f"{item.get('title', '')} {item.get('summary', '')}")
    if re.search(r"roubo|saque|assalto|carga", text):
        return "Roubo de carga"
    if re.search(r"manifestacao|protesto|bloqueio por manifestantes", text):
        return "Manifestacao"
    if re.search(r"acidente|colisao|batida|tombamento|capotamento", text):
        return "Acidente"
    if re.search(r"bloqueio|interdicao|interdita|pista bloqueada|pare-e-siga", text):
        return "Interdicao"
    if re.search(r"lentidao|congestionamento|fila|trafego lento", text):
        return "Lentidao"
    if re.search(r"tempestade|chuva|vento|granizo|inmet|alagamento|barreira", text):
        return "Clima"
    if re.search(r"obra|servico|manutencao|recuperacao", text):
        return "Obra"
    if re.search(r"fiscalizacao|operacao policial|prf", text):
        return "Fiscalizacao"
    return "Monitoramento"


def _risk_from_item(item: dict) -> str:
    text = _match_text(f"{item.get('title', '')} {item.get('summary', '')} {item.get('category', '')} {item.get('type', '')}")
    if re.search(r"roubo de carga|saque|bloqueio total|interdicao total|manifestacao", text):
        return "Critico"
    if re.search(r"acidente|bloqueio|interdicao|tempestade|perigo|queda de barreira|tombamento", text):
        return "Alto"
    if re.search(r"lentidao|chuva forte|obra|interdicao parcial|congestionamento|pare-e-siga", text):
        return "Medio"
    return "Baixo"


def _risk_rank(value: str) -> int:
    return {"Critico": 4, "Alto": 3, "Medio": 2, "Baixo": 1}.get(value, 0)


def _short(value: str, limit: int = 160) -> str:
    text = _plain(value)
    if len(text) <= limit:
        return text
    return re.sub(r"\s+\S*$", "", text[: limit - 1]) + "..."


def build_weekly_context(items: list[dict], days: int = 7) -> dict:
    source_counts = Counter(_plain(item.get("source")) or "Sem fonte" for item in items)
    type_counts = Counter(_plain(item.get("type")) or "Noticia" for item in items)

    # Enrich locally so the email has useful KPIs and priorities even without AI.
    compact_items = []
    for item in items[:120]:
        title = _plain(item.get("title"))
        summary = _plain(item.get("summary"))[:700]
        merged = f"{title} {summary}"
        compact_items.append(
            {
                "title": title,
                "source": _plain(item.get("source")),
                "type": _plain(item.get("type")),
                "category": _category_from_item(item),
                "risk_level": _risk_from_item(item),
                "region": _region_from_text(merged),
                "road": _road_from_text(merged),
                "published_at": _date_text(item.get("published_at")),
                "scraped_at": _date_text(item.get("scraped_at")),
                "summary": summary,
                "short_summary": _short(summary or title),
                "url": _plain(item.get("url")),
            }
        )

    road_counts = Counter(item["road"] for item in compact_items if item.get("road"))
    region_counts = Counter(item["region"] for item in compact_items if item.get("region"))
    risk_counts = Counter(item["risk_level"] for item in compact_items if item.get("risk_level"))
    category_counts = Counter(item["category"] for item in compact_items if item.get("category"))
    top_occurrences = sorted(
        compact_items,
        key=lambda item: (_risk_rank(item.get("risk_level", "")), bool(item.get("road") or item.get("region"))),
        reverse=True,
    )[:5]
    top_occurrences = [
        {
            "title": item.get("title"),
            "region": item.get("region"),
            "road": item.get("road"),
            "category": item.get("category"),
            "risk": item.get("risk_level"),
            "source": item.get("source"),
            "date": item.get("published_at") or item.get("scraped_at"),
            "url": item.get("url"),
            "short_summary": item.get("short_summary"),
        }
        for item in top_occurrences
        if item.get("title")
    ]
    high_critical = sum(1 for item in compact_items if _risk_rank(item.get("risk_level", "")) >= 3)
    top_source = source_counts.most_common(1)[0][0] if source_counts else "Sem fonte"
    indicators = {
        "total_news": len(items),
        "high_critical_alerts": high_critical,
        "impacted_regions": len(region_counts),
        "cited_roads": len(road_counts),
        "top_source": top_source,
        "updated_at": brasilia_now().strftime("%d/%m/%Y %H:%M"),
    }
    weekly_points = [
        f"Foram analisados {len(items)} registros nos ultimos {days} dias, com {high_critical} alerta(s) de risco alto ou critico.",
        "Rodovias mais citadas: " + ", ".join(road for road, _ in road_counts.most_common(3)) + "." if road_counts else "Nao houve rodovia dominante identificada nos registros.",
        "Regioes com maior recorrencia: " + ", ".join(region for region, _ in region_counts.most_common(3)) + "." if region_counts else f"Fonte mais recorrente no periodo: {top_source}.",
    ]

    return {
        "period_days": days,
        "generated_at": brasilia_now().strftime("%d/%m/%Y %H:%M"),
        "total": len(items),
        "sources": source_counts.most_common(12),
        "types": type_counts.most_common(8),
        "roads": road_counts.most_common(10),
        "regions": region_counts.most_common(10),
        "risk_counts": risk_counts.most_common(),
        "category_counts": category_counts.most_common(),
        "indicators": indicators,
        "weekly_points": weekly_points,
        "top_occurrences": top_occurrences,
        "items": compact_items,
    }


def fallback_summary(context: dict) -> dict:
    top_sources = ", ".join(f"{name} ({count})" for name, count in context["sources"][:4]) or "sem fontes recentes"
    top_roads = ", ".join(f"{road} ({count})" for road, count in context["roads"][:5]) or "sem rodovias identificadas"
    operational = [
        item["title"]
        for item in context["items"]
        if item.get("title")
        and re.search(
            r"acidente|bloqueio|interdi|obra|lentid|congestion|desvio|pare-e-siga|alagamento|queda|tombamento",
            f"{item.get('title', '')} {item.get('summary', '')}",
            flags=re.IGNORECASE,
        )
    ]
    inmet = [item for item in context["items"] if item.get("type") == "INMET"]
    return {
        "headline": "Resumo semanal rodoviario",
        "executive_summary": (
            f"Foram identificados {context['total']} registros nos ultimos {context['period_days']} dias. "
            f"As fontes com maior volume foram {top_sources}. As rodovias mais citadas foram {top_roads}."
        ),
        "risk_level": "Atencao" if context["total"] else "Normal",
        "indicators": context.get("indicators", {}),
        "weekly_points": context.get("weekly_points", []),
        "top_occurrences": context.get("top_occurrences", []),
        "featured_regions": [f"{region} ({count})" for region, count in context.get("regions", [])[:6]],
        "featured_roads": [f"{road} ({count})" for road, count in context.get("roads", [])[:6]],
        "featured_categories": [f"{category} ({count})" for category, count in context.get("category_counts", [])[:6]],
        "operational_points": operational[:6],
        "critical_roads": [
            {
                "road": road,
                "why_critical": f"Rodovia citada em {count} registro(s) no periodo.",
                "blockage_status": "Nao confirmado nos dados analisados.",
                "works_status": "Nao confirmado nos dados analisados.",
                "evidence": "Volume de mencoes no periodo.",
            }
            for road, count in context["roads"][:5]
        ],
        "inmet_regions": [
            {
                "region": "Regioes citadas no aviso INMET",
                "danger_reason": item.get("title", "Alerta meteorologico"),
                "rainfall_or_wind": item.get("summary", "")[:220],
                "attention_required": "Avaliar impacto em rotas que cruzam a area do alerta.",
                "evidence": item.get("source", "INMET"),
            }
            for item in inmet[:5]
        ],
        "blockages_or_works": [
            item["title"]
            for item in context["items"]
            if re.search(r"bloqueio|interdi|obra|pare-e-siga", f"{item.get('title', '')} {item.get('summary', '')}", flags=re.IGNORECASE)
        ][:6],
        "detours": ["Nao ha desvio alternativo confirmado nos dados analisados."],
        "weather_notes": [
            f"{item.get('title', '')}: {item.get('summary', '')[:220]}"
            for item in inmet
        ][:5],
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
                    "Analise os registros rodoviarios abaixo e gere um relatorio executivo semanal em JSON valido. "
                    "O resumo semanal e estrategico, para tendencia e planejamento, nao operacao em tempo real. "
                    "Nao liste todas as noticias. Mostre principais riscos da semana, estados/regioes com mais ocorrencias, "
                    "rodovias mais citadas, categorias frequentes e top 5 ocorrencias realmente relevantes. "
                    "Para INMET, informe regioes em perigo, por que estao em perigo, quantidade de chuva/vento quando existir, "
                    "e quais regioes exigem atencao. Para rodovias criticas, explique por que sao criticas, se ha bloqueio, "
                    "interdicao, lentidao, obra ou pare-e-siga, e cite a evidencia. Informe desvios apenas se houver dado explicito; "
                    "se nao houver, diga que nao ha desvio confirmado. Nao invente fatos fora do contexto.\n\n"
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
                    "Voce e um analista operacional de risco rodoviario do Road News. "
                    "Responda somente com JSON valido contendo: headline, executive_summary, risk_level, "
                    "indicators, weekly_points, top_occurrences, featured_regions, featured_roads, featured_categories, "
                    "operational_points, critical_roads, inmet_regions, blockages_or_works, detours, weather_notes, recommendations. "
                    "top_occurrences deve ter no maximo 5 objetos com title, region, road, category, risk, source, date, url, short_summary. "
                    "weekly_points e recommendations devem ter no maximo 3 bullets cada. "
                    "critical_roads deve ser array de objetos com road, why_critical, blockage_status, works_status, evidence. "
                    "inmet_regions deve ser array de objetos com region, danger_reason, rainfall_or_wind, attention_required, evidence. "
                    "operational_points deve conter apenas impactos reais para transporte: rodovia travada, bloqueio, obra, lentidao relevante, "
                    "acidente, clima severo ou necessidade de monitorar/desviar rota. Use portugues do Brasil, tom executivo e frases objetivas."
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
            "max_output_tokens": 2400,
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

    def item_text(item):
        if isinstance(item, dict):
            labels = {
                "road": "Rodovia",
                "why_critical": "Por que e critica",
                "blockage_status": "Bloqueio",
                "works_status": "Obras",
                "evidence": "Evidencia",
                "region": "Regiao",
                "danger_reason": "Motivo do perigo",
                "rainfall_or_wind": "Chuva/vento",
                "attention_required": "Atencao necessaria",
            }
            return " | ".join(f"{labels.get(key, key)}: {value}" for key, value in item.items() if value)
        return str(item)

    def list_html(items, empty):
        values = items if isinstance(items, list) and items else [empty]
        return "".join(f"<li>{esc(item_text(item))}</li>" for item in values[:8])

    def kpi_html():
        indicators = summary.get("indicators") or context.get("indicators", {})
        cards = [
            ("Noticias na semana", indicators.get("total_news", context.get("total", 0))),
            ("Alertas criticos/alto risco", indicators.get("high_critical_alerts", 0)),
            ("Regioes impactadas", indicators.get("impacted_regions", 0)),
            ("Rodovias citadas", indicators.get("cited_roads", len(context.get("roads", [])))),
            ("Fonte recorrente", indicators.get("top_source", "-")),
            ("Ultima atualizacao", indicators.get("updated_at", context.get("generated_at", "-"))),
        ]
        return "".join(f"<div class='kpi'><span>{esc(label)}</span><strong>{esc(value)}</strong></div>" for label, value in cards)

    def occurrences_html():
        items = summary.get("top_occurrences") or context.get("top_occurrences") or []
        if not items:
            return "<p>Nenhuma ocorrencia operacional relevante confirmada no periodo.</p>"
        rows = []
        for item in items[:5]:
            region_road = " - ".join(part for part in [item.get("road"), item.get("region")] if part)
            rows.append(
                "<div class='occurrence'>"
                f"<div class='meta'>{esc(item.get('risk', 'Baixo'))} | {esc(item.get('category', 'Monitoramento'))}"
                f"{' | ' + esc(region_road) if region_road else ''}{' | ' + esc(item.get('date')) if item.get('date') else ''}</div>"
                f"<h3>{esc(item.get('title', 'Ocorrencia monitorada'))}</h3>"
                f"<p>{esc(item.get('short_summary', ''))}</p>"
                f"<div class='meta'>Fonte: {esc(item.get('source', 'Nao informada'))}</div>"
                "</div>"
            )
        return "".join(rows)

    points = list_html(summary.get("weekly_points") or summary.get("operational_points", []), "Sem ponto operacional relevante confirmado.")
    roads = list_html(summary.get("critical_roads", []), "Sem rodovia critica confirmada.")
    inmet_regions = list_html(summary.get("inmet_regions", []), "Sem regiao INMET relevante no periodo.")
    blockages = list_html(summary.get("blockages_or_works", []), "Sem bloqueio, obra ou pare-e-siga confirmado.")
    detours = list_html(summary.get("detours", []), "Sem desvio alternativo confirmado.")
    recommendations = list_html(summary.get("recommendations", []), "Manter monitoramento das fontes rodoviarias.")
    source_rows = "".join(
        f"<tr><td>{esc(name)}</td><td align='right'><strong>{count}</strong></td></tr>"
        for name, count in context.get("sources", [])[:10]
    )

    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ margin:0; background:#061b14; color:#f3f7f5; font-family:Arial, Helvetica, sans-serif; }}
    .wrap {{ max-width:760px; margin:0 auto; padding:28px 18px; }}
    .hero {{ background:#0b2a20; color:#f5fbf8; border:1px solid rgba(32,242,155,.28); border-top:4px solid #20f29b; padding:28px; }}
    .brand {{ font-weight:900; font-size:30px; letter-spacing:.04em; }}
    .brand:before {{ content:""; display:inline-block; border-left:18px solid transparent; border-right:18px solid transparent; border-top:28px solid #20f29b; margin-right:12px; transform:translateY(6px); }}
    .sub {{ color:#20f29b; font-weight:800; letter-spacing:.13em; font-size:13px; margin-top:6px; }}
    .card {{ background:#0b2a20; border:1px solid rgba(32,242,155,.22); padding:22px; margin-top:16px; }}
    .kpis {{ display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-top:16px; }}
    .kpi {{ background:#0b2a20; border:1px solid rgba(32,242,155,.22); padding:14px; }}
    .kpi span {{ display:block; color:#a7b8b1; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }}
    .kpi strong {{ display:block; margin-top:8px; font-size:22px; }}
    .occurrence {{ border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05); padding:14px; margin-bottom:10px; }}
    .occurrence h3 {{ margin:8px 0 6px; font-size:16px; }}
    .meta {{ color:#a7b8b1; font-size:12px; font-weight:700; }}
    h1 {{ font-size:28px; margin:22px 0 8px; }}
    h2 {{ font-size:16px; letter-spacing:.08em; text-transform:uppercase; margin:0 0 14px; }}
    p, li, td {{ font-size:15px; line-height:1.55; }}
    .risk {{ display:inline-block; background:#20f29b; color:#03120d; padding:7px 12px; font-weight:900; border-radius:999px; margin-top:12px; }}
    .pill {{ display:inline-block; border:1px solid #20f29b; color:#f3f7f5; padding:7px 10px; margin:0 8px 8px 0; border-radius:999px; font-weight:700; }}
    table {{ width:100%; border-collapse:collapse; }}
    td {{ border-bottom:1px solid rgba(255,255,255,.12); padding:8px 0; }}
    .foot {{ color:#a7b8b1; font-size:12px; margin-top:18px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="brand">ROAD NEWS</div>
      <div class="sub">RESUMO EXECUTIVO DE INTELIGENCIA RODOVIARIA</div>
      <h1>{esc(summary.get("headline"))}</h1>
      <p>{esc(summary.get("executive_summary"))}</p>
      <div class="risk">Risco: {esc(summary.get("risk_level"))}</div>
    </div>
    <div class="kpis">{kpi_html()}</div>
    <div class="card">
      <h2>Principais pontos da semana</h2>
      <ul>{points}</ul>
    </div>
    <div class="card">
      <h2>Top ocorrencias relevantes</h2>
      {occurrences_html()}
    </div>
    <div class="card">
      <h2>INMET: Regioes em Perigo</h2>
      <ul>{inmet_regions}</ul>
    </div>
    <div class="card">
      <h2>Rodovias Criticas</h2>
      <ul>{roads}</ul>
    </div>
    <div class="card">
      <h2>Bloqueios, Obras e Desvios</h2>
      <ul>{blockages}</ul>
      <ul>{detours}</ul>
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
    subject = f"Road News - resumo semanal ({context['generated_at']})"
    delivery = send_resend_email(html_body, subject)
    return {"summary": summary, "context": context, "delivery": delivery}
