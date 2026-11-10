"""E-mail semanal para gestores de frota (GitHub Actions, segunda-feira 08:00).

O conteúdo vem de scraper/weekly_brief.py, o mesmo cálculo do resumo semanal do painel
(api/_weekly_brief.js). A IA, quando configurada, só redige título e abertura a partir dos
fatos já calculados.
"""

from __future__ import annotations

import html
import json
import os
import re
from datetime import timedelta

import psycopg
import requests

from scraper.utils.timezone import brasilia_now
from scraper.weekly_brief import build_weekly_brief

OPENAI_URL = "https://api.openai.com/v1/responses"
RESEND_URL = "https://api.resend.com/emails"
DEFAULT_MODEL = "gpt-4.1-mini"

# Escala de gravidade da identidade Overhaul (igual ao painel).
LEVEL_COLORS = {"critical": "#FC3700", "high": "#FFCD00", "medium": "#00ACFF", "low": "#1EFF95"}


def fetch_weekly_news(database_url: str, days: int = 14, limit: int = 800) -> list[dict]:
    """Semana atual + anterior (para o comparativo)."""
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
            rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    # timestamptz chega como datetime; o resumo trabalha com ISO, igual à API.
    for row in rows:
        for key in ("created_at", "published_at", "scraped_at"):
            if hasattr(row.get(key), "isoformat"):
                row[key] = row[key].isoformat()
    return rows


def _facts_for_ai(brief: dict) -> dict:
    def pick(items, n):
        return [{k: v for k, v in item.items() if k not in {"url", "worst_url"}} for item in items[:n]]
    return {
        "period": brief["period"], "verdict": brief["verdict"], "numbers": brief["numbers"],
        "watchlist": pick(brief["watchlist"], 6), "hotspots": pick(brief["hotspots"], 3),
        "cargo_security": pick(brief["cargo_security"], 3), "weather": brief["weather"][:3], "actions": brief["actions"],
    }


def polish_with_ai(brief: dict, api_key: str | None = None, model: str | None = None) -> dict:
    api_key = (api_key or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return brief
    try:
        response = requests.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model or os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
                "max_output_tokens": 500,
                "input": [
                    {"role": "developer", "content": [{"type": "input_text", "text": (
                        "Você redige a abertura do resumo semanal do Road News para gestores de frota de transporte rodoviário "
                        "de cargas. Use SOMENTE os fatos do JSON; não invente rodovia, data, número ou causa. Português do Brasil, "
                        "tom direto de torre de controle. Responda apenas JSON válido com: headline (até 90 caracteres, diz o que "
                        "mais pesa na semana) e executive_summary (2 a 3 frases, até 420 caracteres: o que aconteceu, o que vem "
                        "nos próximos dias e a principal ação). Não repita a lista de números inteira."
                    )}]},
                    {"role": "user", "content": [{"type": "input_text", "text": json.dumps(_facts_for_ai(brief), ensure_ascii=False)}]},
                ],
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        text = data.get("output_text") or "".join(
            content.get("text", "") for output in data.get("output", []) for content in output.get("content", [])
        )
        parsed = json.loads(re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.I | re.M).strip())
        headline = str(parsed.get("headline") or "").strip()
        summary = str(parsed.get("executive_summary") or "").strip()
        if headline and summary:
            return {**brief, "headline": headline[:120], "executive_summary": summary[:520], "ai_used": True}
    except Exception as error:  # a IA nunca pode impedir o envio
        print(f"[Resumo semanal] IA indisponível ({error.__class__.__name__}); usando texto automático.")
    return brief


def render_weekly_email(brief: dict, generated_at: str) -> str:
    def esc(value) -> str:
        return html.escape(str(value or ""))

    def place(item) -> str:
        return "/".join(part for part in (item.get("road"), item.get("uf")) if part)

    def link(title, url) -> str:
        safe = url if re.match(r"^https?://", str(url or "")) else ""
        return f'<a href="{esc(safe)}" style="color:#1eff95;text-decoration:none">{esc(title)}</a>' if safe else esc(title)

    def badge(text, level) -> str:
        color = LEVEL_COLORS.get(level, "#CFD1D0")
        return (f'<span style="display:inline-block;border:1px solid {color};color:{color};border-radius:999px;'
                f'padding:2px 8px;font-size:11px;font-weight:700;text-transform:uppercase">{esc(text)}</span>')

    def section(title, body, accent="#26352D") -> str:
        return (f'<tr><td style="padding:14px 16px;border:1px solid {accent};border-radius:8px;background:#16221C">'
                f'<div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#F4F9FA;margin-bottom:10px">{esc(title)}</div>'
                f'{body}</td></tr><tr><td style="height:12px"></td></tr>')

    def empty(text) -> str:
        return f'<p style="margin:0;color:#9FA3A1;font-size:13px">{esc(text)}</p>'

    level = brief["verdict"]["level"]
    kpis = "".join(
        f'<td style="padding:8px;border:1px solid #26352D;border-radius:6px;background:#1C2B24;vertical-align:top;width:{100 // 4}%">'
        f'<div style="font-size:10px;color:#9FA3A1;text-transform:uppercase;font-weight:700">{esc(n["label"])}</div>'
        f'<div style="font-size:22px;font-weight:800;color:{"#F4F9FA" if n["value"] else "#9FA3A1"}">{n["value"]}</div>'
        f'<div style="font-size:11px;color:{"#FC3700" if n["delta"] > 0 else "#1EFF95" if n["delta"] < 0 else "#9FA3A1"}">'
        f'{"▲ " + str(n["delta"]) if n["delta"] > 0 else "▼ " + str(-n["delta"]) if n["delta"] < 0 else "="} vs semana anterior ({n["previous"]})</div></td>'
        + ("</tr><tr>" if i == 3 else "")
        for i, n in enumerate(brief["numbers"])
    )

    watch = "".join(
        f'<div style="border-left:3px solid {"#FC3700" if w["type"] in ("Pode seguir bloqueado", "Paralisação/manifestação") else "#FFCD00"};'
        f'padding:8px 10px;margin-bottom:8px;background:#1C2B24">'
        f'{badge(w["type"], w["level"])} <span style="color:#9FA3A1;font-size:12px">{esc(place(w))}'
        f'{" · Agendado: " + esc(w["scheduled"]) if w["scheduled"] else (" · Notícia de " + esc(w["date"]) if w["date"] else "")}</span>'
        f'<div style="margin:6px 0 4px;font-size:14px;font-weight:700;color:#F4F9FA">{link(w["title"], w["url"])}</div>'
        f'<div style="font-size:13px;color:#CFD1D0"><strong>O que fazer:</strong> {esc(w["action"])}</div></div>'
        for w in brief["watchlist"]
    ) or empty("Nada programado ou pendente para os próximos dias nas fontes monitoradas.")

    actions = "<ol style='margin:0;padding-left:20px'>" + "".join(
        f'<li style="color:#F4F9FA;font-size:14px;margin:4px 0">{esc(a)}</li>' for a in brief["actions"]
    ) + "</ol>"

    th = 'style="text-align:left;font-size:10px;color:#9FA3A1;text-transform:uppercase;padding:4px 6px;border-bottom:1px solid #26352D"'
    td = 'style="font-size:13px;color:#CFD1D0;padding:6px;border-bottom:1px solid #26352D;vertical-align:top"'
    hotspots = (
        f'<table width="100%" cellspacing="0" cellpadding="0"><tr><th {th}>Trecho</th><th {th}>Ocorr.</th><th {th}>Principal problema</th><th {th}>O que fazer</th></tr>'
        + "".join(
            f'<tr><td {td}><strong style="color:#F4F9FA">{esc(place(h))}</strong></td><td {td}>{h["events"]}</td>'
            f'<td {td}>{esc(h["main_problem"])}<br><span style="font-size:11px">Ex.: {link(h["worst_title"][:80], h["worst_url"])}</span></td>'
            f'<td {td}>{esc(h["action"])}</td></tr>'
            for h in brief["hotspots"]
        ) + "</table>"
    ) if brief["hotspots"] else empty("Nenhum trecho concentrou ocorrências graves na semana.")

    cargo = "".join(
        f'<div style="font-size:13px;color:#CFD1D0;margin-bottom:6px">{badge("Trecho visado" if c["police"] else "Roubo de carga", "medium" if c["police"] else "high")} '
        f'<strong style="color:#F4F9FA">{esc(place(c))}</strong> {link(c["title"][:110], c["url"])}</div>'
        for c in brief["cargo_security"]
    ) or empty("Nenhum roubo de carga noticiado na semana nas fontes monitoradas.")

    weather = (
        f'<table width="100%" cellspacing="0" cellpadding="0"><tr><th {th}>Área</th><th {th}>Avisos</th><th {th}>Nível máximo</th><th {th}>Fenômenos</th></tr>'
        + "".join(
            f'<tr><td {td}><strong style="color:#F4F9FA">{esc(w["uf"])}</strong></td><td {td}>{w["alerts"]}</td><td {td}>{esc(w["max_level"])}</td><td {td}>{esc(", ".join(w["phenomena"]))}</td></tr>'
            for w in brief["weather"]
        ) + "</table>"
    ) if brief["weather"] else empty("Sem avisos do INMET no período.")

    highlights = "".join(
        f'<div style="padding:8px 0;border-bottom:1px solid #26352D">{badge(h["level_label"], h["level"])} '
        f'<span style="color:#9FA3A1;font-size:12px">{esc(h["kind_label"])} · {esc(place(h))} {esc(h["date"])}'
        f'{" · " + str(h["sources"]) + " fontes" if h["sources"] > 1 else ""}</span>'
        f'<div style="margin-top:4px;font-size:14px;color:#F4F9FA">{link(h["title"], h["url"])}</div>'
        f'<div style="font-size:12px;color:#CFD1D0">{esc(h["action"])}</div></div>'
        for h in brief["highlights"]
    ) or empty("Nenhuma ocorrência de risco alto ou crítico na semana.")

    cov = brief["coverage"]
    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Road News - Resumo semanal da frota</title></head>
<body style="margin:0;padding:0;background:#0F1814;font-family:'Archivo',Arial,Helvetica,sans-serif;color:#F4F9FA">
<table width="100%" cellspacing="0" cellpadding="0" style="background:#0F1814"><tr><td align="center" style="padding:20px 12px">
<table width="100%" cellspacing="0" cellpadding="0" style="max-width:720px">
<tr><td style="padding:18px;border:1px solid #1eff95;border-top:4px solid #1eff95;border-radius:8px;background:#16221C">
  <div style="font-size:22px;font-weight:900;letter-spacing:.04em">ROAD NEWS</div>
  <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#1eff95;margin-top:4px">Resumo semanal da frota</div>
  <div style="margin-top:12px">{badge("Semana: " + brief["verdict"]["label"], level)}
    <span style="color:#9FA3A1;font-size:12px">{esc(brief["period"]["start"])} a {esc(brief["period"]["end"])}</span></div>
  <h1 style="font-size:22px;line-height:1.25;margin:10px 0 6px;color:#F4F9FA">{esc(brief["headline"])}</h1>
  <p style="margin:0;font-size:14px;line-height:1.5;color:#CFD1D0">{esc(brief["executive_summary"])}</p>
</td></tr><tr><td style="height:12px"></td></tr>
<tr><td><table width="100%" cellspacing="6" cellpadding="0"><tr>{kpis}</tr></table></td></tr><tr><td style="height:12px"></td></tr>
{section("Atenção para os próximos dias", watch, "#FFCD00")}
{section("O que fazer esta semana", actions, "#1eff95")}
{section("Trechos mais críticos da semana", hotspots)}
{section("Segurança da carga", cargo)}
{section("Clima (avisos INMET)", weather)}
{section("Principais ocorrências", highlights)}
<tr><td style="font-size:11px;color:#9FA3A1;line-height:1.5;padding:4px 2px">
  Gerado em {esc(generated_at)}. Base: {cov["analyzed"]} notícias dos últimos 7 dias, agrupadas em {cov["events"]} ocorrências com impacto operacional
  ({cov["discarded"]} sem impacto na frota descartadas). Comparativo com os 7 dias anteriores.
  {"Texto de abertura redigido por IA a partir destes dados; números e ações calculados pelo Road News. " if brief.get("ai_used") else ""}Confirme sempre com concessionária/PRF antes de liberar o veículo.
</td></tr>
</table></td></tr></table></body></html>"""


def send_resend_email(html_body: str, subject: str, api_key: str | None = None) -> dict:
    api_key = api_key or os.environ.get("RESEND_API_KEY")
    recipients = [email.strip() for email in os.environ.get("WEEKLY_EMAIL_TO", "").split(",") if email.strip()]
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
    items = fetch_weekly_news(database_url, days=days * 2)
    brief = polish_with_ai(build_weekly_brief(items))
    generated_at = brasilia_now().strftime("%d/%m/%Y %H:%M")
    html_body = render_weekly_email(brief, generated_at)
    subject = f"Road News · Semana {brief['verdict']['label'].lower()} · {brief['period']['start']} a {brief['period']['end']}"
    delivery = send_resend_email(html_body, subject)
    return {"summary": brief, "delivery": delivery}
