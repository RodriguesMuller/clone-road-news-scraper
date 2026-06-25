"""
POST /api/send_digest — gera e envia o boletim da última hora (Vercel Function).

Fluxo:
  1. lê do Postgres os registros criados na última hora;
  2. renderiza um e-mail HTML no estilo Overhaul (estilos inline, email-safe);
  3. envia via Resend, se RESEND_API_KEY + EMAIL_TO estiverem configurados;
     caso contrário, devolve a contagem e um aviso (sem enviar).

Env vars:
  DATABASE_URL    connection string do Supabase (pooler)
  RESEND_API_KEY  chave da API do Resend
  EMAIL_TO        destinatários separados por vírgula
  EMAIL_FROM      remetente verificado (default: onboarding@resend.dev p/ teste)

Autossuficiente: sem imports do pacote scraper (bundle leve no Vercel).
"""
from http.server import BaseHTTPRequestHandler
import os
import json
import html as H

import psycopg
import requests

LAST_HOUR_SQL = """
SELECT title, url, source, category, published_at, type
FROM news
WHERE created_at >= now() - interval '1 hour'
ORDER BY created_at DESC;
"""

# Paleta Overhaul (hex inline — clientes de e-mail não suportam var()).
C = {
    "midnight": "#0F1814", "green": "#1EFF95", "dim": "#6F7472", "steel": "#9FA3A1",
    "alabaster": "#E7E7E7", "smoke": "#F3F3F3", "white": "#FFFFFF",
    "orange": "#FC3700", "yellow": "#FFCD00", "purple": "#5029FF",
}
FONT = "Archivo, 'Helvetica Neue', Arial, sans-serif"
MONO = "'Geist Mono', ui-monospace, Menlo, monospace"


def _fetch_last_hour() -> list:
    dsn = os.environ["DATABASE_URL"]
    rows = []
    with psycopg.connect(dsn, prepare_threshold=None, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(LAST_HOUR_SQL)
            for title, url, source, category, published_at, type_ in cur.fetchall():
                rows.append({"title": title or "", "url": url or "#", "source": source or "",
                             "category": category or "", "type": type_ or ""})
    return rows


def _pill(label, kind):
    bg, fg = {
        "crit": (C["orange"], "#fff"),
        "warn": (C["yellow"], C["midnight"]),
        "ok": (C["green"], C["midnight"]),
        "neutral": (C["smoke"], C["dim"]),
    }[kind]
    return (f'<span style="display:inline-block;padding:3px 9px;border-radius:999px;'
            f'font-family:{MONO};font-size:11px;font-weight:700;text-transform:uppercase;'
            f'letter-spacing:0.06em;background:{bg};color:{fg};">{H.escape(label)}</span>')


def _kind_from_text(text):
    t = (text or "").lower()
    if any(k in t for k in ("interdi", "grande perigo", "bloqueio", "fechad")):
        return "crit"
    if any(k in t for k in ("lentid", "congest", "obras", "perigo")):
        return "warn"
    if any(k in t for k in ("fluindo", "normal", "liberad")):
        return "ok"
    return "neutral"


def _section_label(text, count):
    return (f'<div style="margin:0 0 12px;font-family:{MONO};font-size:12px;font-weight:700;'
            f'letter-spacing:0.14em;text-transform:uppercase;color:{C["midnight"]};">'
            f'<span style="display:inline-block;width:9px;height:9px;background:{C["green"]};'
            f'border-radius:2px;margin-right:8px;"></span>{H.escape(text)}'
            f'<span style="color:{C["steel"]};font-weight:600;"> · {count}</span></div>')


def _news_card(it):
    src = H.escape(f'{it["source"]} · {it["category"]}'.strip(" ·"))
    return (
        f'<div style="border:1px solid {C["alabaster"]};border-radius:8px;padding:14px 16px;margin-bottom:10px;">'
        f'<div style="font-family:{MONO};font-size:10px;font-weight:600;letter-spacing:0.1em;'
        f'text-transform:uppercase;color:{C["dim"]};margin-bottom:6px;">{src}</div>'
        f'<div style="font-family:{FONT};font-size:16px;font-weight:600;line-height:1.32;color:{C["midnight"]};margin-bottom:9px;">{H.escape(it["title"])}</div>'
        f'<a href="{H.escape(it["url"])}" style="font-family:{MONO};font-size:11px;font-weight:700;'
        f'letter-spacing:0.06em;text-transform:uppercase;color:{C["purple"]};text-decoration:none;">Ler notícia →</a>'
        f'</div>'
    )


def _status_row(it):
    kind = _kind_from_text(it["title"])
    label = {"crit": "Interditada", "warn": "Atenção", "ok": "Fluindo", "neutral": "Status"}[kind]
    return (
        f'<div style="border:1px solid {C["alabaster"]};border-radius:8px;padding:13px 16px;margin-bottom:10px;">'
        f'<div style="margin-bottom:6px;">{_pill(label, kind)} '
        f'<span style="font-family:{FONT};font-size:14px;font-weight:700;color:{C["midnight"]};margin-left:8px;">{H.escape(it["source"])}</span></div>'
        f'<div style="font-family:{FONT};font-size:13px;line-height:1.5;color:{C["dim"]};">{H.escape(it["title"])}</div>'
        f'</div>'
    )


def render_email(items: list, when_label: str = "última hora") -> str:
    noticias = [i for i in items if i["type"] not in ("ARTERIS", "INMET")]
    rodovias = [i for i in items if i["type"] == "ARTERIS"]
    clima = [i for i in items if i["type"] == "INMET"]

    parts = []
    # Header
    parts.append(
        f'<div style="background:{C["midnight"]};padding:24px 28px;">'
        f'<div style="font-family:{FONT};font-size:20px;font-weight:900;letter-spacing:-0.01em;color:{C["white"]};">'
        f'Overhaul <span style="color:{C["green"]};">·</span> Road News</div>'
        f'<div style="margin-top:10px;font-family:{MONO};font-size:11px;font-weight:600;'
        f'letter-spacing:0.14em;text-transform:uppercase;color:{C["green"]};">Boletim rodoviário · {H.escape(when_label)}</div>'
        f'</div>'
    )
    # Intro
    parts.append(
        f'<div style="padding:22px 28px 4px;">'
        f'<div style="font-family:{FONT};font-size:14px;line-height:1.55;color:{C["dim"]};">'
        f'Resumo da última hora: <b style="color:{C["midnight"]};">{len(noticias)}</b> notícias, '
        f'<b style="color:{C["midnight"]};">{len(rodovias)}</b> status de rodovia e '
        f'<b style="color:{C["midnight"]};">{len(clima)}</b> alertas de clima.</div></div>'
    )
    # Seção: Principais notícias
    if noticias:
        body = "".join(_news_card(i) for i in noticias[:8])
        parts.append(f'<div style="padding:20px 28px 4px;">{_section_label("Principais notícias", len(noticias))}{body}</div>')
    # Seção: Rodovias
    if rodovias:
        body = "".join(_status_row(i) for i in rodovias[:8])
        parts.append(f'<div style="padding:18px 28px 4px;border-top:1px solid {C["alabaster"]};">{_section_label("Rodovias · status", len(rodovias))}{body}</div>')
    # Seção: Clima
    if clima:
        body = "".join(_status_row(i) for i in clima[:8])
        parts.append(f'<div style="padding:18px 28px 4px;border-top:1px solid {C["alabaster"]};">{_section_label("Alertas de clima", len(clima))}{body}</div>')
    # Footer
    parts.append(
        f'<div style="background:{C["midnight"]};padding:20px 28px;margin-top:14px;">'
        f'<div style="font-family:{MONO};font-size:11px;line-height:1.6;color:#CFD1D0;">'
        f'Boletim gerado automaticamente pelo Road News, da Overhaul.</div>'
        f'<div style="font-family:{MONO};font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:{C["steel"]};margin-top:8px;">'
        f'Fontes: Google News · G1 · CNN Brasil · Band · INMET · Arteris</div></div>'
    )

    inner = "".join(parts)
    return (
        f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        f'<body style="margin:0;background:{C["smoke"]};">'
        f'<div style="background:{C["smoke"]};padding:28px 12px;">'
        f'<div style="max-width:600px;margin:0 auto;background:{C["white"]};'
        f'border:1px solid {C["alabaster"]};border-radius:12px;overflow:hidden;">{inner}</div></div>'
        f'</body></html>'
    )


def _send_resend(html_body, subject, to_list, api_key, sender):
    return requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"from": sender, "to": to_list, "subject": subject, "html": html_body},
        timeout=20,
    )


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            items = _fetch_last_hour()
            if not items:
                return self._json(200, {"sent": False, "count": 0,
                                        "reason": "Sem novidades na última hora."})

            html_body = render_email(items)
            api_key = os.environ.get("RESEND_API_KEY")
            to_list = [e.strip() for e in os.environ.get("EMAIL_TO", "").split(",") if e.strip()]
            sender = os.environ.get("EMAIL_FROM", "Road News <onboarding@resend.dev>")

            if not api_key or not to_list:
                return self._json(200, {"sent": False, "count": len(items),
                                        "reason": "Configure RESEND_API_KEY e EMAIL_TO no Vercel para enviar."})

            resp = _send_resend(html_body, f"Boletim rodoviário — {len(items)} novidades", to_list, api_key, sender)
            if resp.status_code in (200, 201):
                return self._json(200, {"sent": True, "count": len(items), "to": to_list})
            return self._json(502, {"sent": False, "count": len(items),
                                    "reason": f"Resend respondeu {resp.status_code}: {resp.text[:200]}"})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"sent": False, "error": str(e)})

    def do_GET(self):
        # Conveniência: GET só informa quantos itens entrariam (não envia).
        try:
            n = len(_fetch_last_hour())
            return self._json(200, {"sent": False, "count": n,
                                    "reason": "Use POST para enviar o boletim."})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": str(e)})
