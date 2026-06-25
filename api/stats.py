"""
GET /api/stats — visão geral do fluxo (Vercel Function, Python).

Lê o Postgres (Supabase) via DATABASE_URL e devolve:
  total, last_hour, last_24h, last_created (ISO), e contagem por fonte (24h).

Autossuficiente de propósito: não importa código do pacote scraper, para o
bundle da função no Vercel ficar leve e o deploy não depender de imports do repo.
"""
from http.server import BaseHTTPRequestHandler
import os
import json

import psycopg

OVERVIEW_SQL = """
SELECT
    count(*)                                                           AS total,
    count(*) FILTER (WHERE created_at >= now() - interval '1 hour')    AS last_hour,
    count(*) FILTER (WHERE created_at >= now() - interval '24 hours')  AS last_24h,
    max(created_at)                                                    AS last_created
FROM news;
"""

SOURCES_SQL = """
SELECT source, count(*) AS n
FROM news
WHERE created_at >= now() - interval '24 hours'
GROUP BY source
ORDER BY n DESC;
"""


def get_stats() -> dict:
    dsn = os.environ["DATABASE_URL"]
    with psycopg.connect(dsn, prepare_threshold=None, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(OVERVIEW_SQL)
            total, last_hour, last_24h, last_created = cur.fetchone()
            cur.execute(SOURCES_SQL)
            sources = [{"source": s, "count": n} for s, n in cur.fetchall()]
    return {
        "total": total or 0,
        "last_hour": last_hour or 0,
        "last_24h": last_24h or 0,
        "last_created": last_created.isoformat() if last_created else None,
        "sources": sources,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            payload = get_stats()
            code = 200
        except Exception as e:  # noqa: BLE001 — superfície de erro amigável p/ o front
            payload = {"error": str(e)}
            code = 500
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
