"""
GET /api/news?limit=25 — notícias mais recentes (Vercel Function, Python).

Lê o Postgres (Supabase) via DATABASE_URL e devolve a lista ordenada por
created_at desc. Autossuficiente (sem imports do pacote scraper).
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import os
import json

import psycopg

NEWS_SQL = """
SELECT title, url, source, category, published_at, created_at, type
FROM news
ORDER BY created_at DESC
LIMIT %s;
"""


def get_news(limit: int = 25) -> list:
    dsn = os.environ["DATABASE_URL"]
    out = []
    with psycopg.connect(dsn, prepare_threshold=None, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(NEWS_SQL, (limit,))
            for title, url, source, category, published_at, created_at, type_ in cur.fetchall():
                out.append(
                    {
                        "title": title,
                        "url": url,
                        "source": source,
                        "category": category,
                        "published_at": published_at,
                        "created_at": created_at.isoformat() if created_at else None,
                        "type": type_,
                    }
                )
    return out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            qs = parse_qs(urlparse(self.path).query)
            limit = int(qs.get("limit", ["25"])[0])
            limit = max(1, min(limit, 100))
            payload = {"items": get_news(limit)}
            code = 200
        except Exception as e:  # noqa: BLE001
            payload = {"error": str(e)}
            code = 500
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
