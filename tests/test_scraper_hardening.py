"""Regressao das correcoes do scraper na auditoria QA de 2026-11-09."""
import unittest
from unittest import mock

import requests

from scraper.sources import rss
from scraper.storage import postgres


class FakeCursor:
    def __init__(self):
        self.statements = []
        self.rowcount = 1

    def execute(self, sql, params=None):
        self.statements.append(sql)

    def fetchall(self):
        last = self.statements[-1]
        if "information_schema.columns" in last:
            return [(name,) for name in postgres.COLUMNS]
        return []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConnection:
    def __init__(self):
        self.cursor_obj = FakeCursor()

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class SaveToPostgresTest(unittest.TestCase):
    def test_does_not_touch_rls_policies(self):
        conn = FakeConnection()
        items = [
            {"title": "Acidente na BR-116", "url": "https://example.com/a", "source": "X"},
            {"title": "Acidente na BR-116", "url": "https://example.com/a", "source": "X"},
        ]
        with mock.patch.object(postgres.psycopg, "connect", return_value=conn):
            saved = postgres.save_to_postgres(items, "postgresql://test")

        executed = "\n".join(conn.cursor_obj.statements).upper()
        self.assertNotIn("POLICY", executed)
        self.assertNotIn("ROW LEVEL SECURITY", executed)
        # duplicata no mesmo lote e descartada antes de ir ao banco
        self.assertEqual(saved, 1)


class RssFallbackTest(unittest.TestCase):
    def test_fallback_after_403_still_has_a_timeout(self):
        calls = []
        feed_xml = (
            b"<?xml version='1.0'?><rss><channel><item><title>Caminhao tomba na BR-101</title>"
            b"<link>https://example.com/n1</link></item></channel></rss>"
        )

        def fake_get(url, headers=None, timeout=None):
            calls.append({"headers": headers, "timeout": timeout})
            response = mock.Mock()
            if len(calls) == 1:
                response.raise_for_status.side_effect = requests.HTTPError("403 Forbidden")
            else:
                response.raise_for_status.return_value = None
                response.content = feed_xml
            return response

        source = {"name": "Feed teste", "url": "https://example.com/feed", "category": "rodovia"}
        with mock.patch.object(rss.requests, "get", side_effect=fake_get), \
                mock.patch.object(rss.feedparser, "parse", wraps=rss.feedparser.parse) as parse:
            items = rss.scrape_rss(source, ["BR-"])

        self.assertEqual(len(calls), 2)
        self.assertTrue(all(call["timeout"] for call in calls), "toda requisicao precisa de timeout")
        # feedparser nunca deve receber a URL (urllib sem timeout), so o conteudo ja baixado
        for call in parse.call_args_list:
            self.assertIsInstance(call.args[0], bytes)
        self.assertEqual(len(items), 1)


class BandUrlFormatTest(unittest.TestCase):
    def test_accepts_new_and_legacy_article_urls_but_not_sections(self):
        from scraper.sources.html import _BAND_URL_RE

        new = _BAND_URL_RE.search("/noticias/caminhao-tomba-na-br-116-em-sp")
        legacy = _BAND_URL_RE.search("/noticias/caminhao-tomba-na-br-116-202401151030")
        self.assertIsNotNone(new)
        self.assertIsNone(new.group(1))
        self.assertEqual(legacy.group(1), "202401151030")
        self.assertIsNone(_BAND_URL_RE.search("/noticias/brasil"))
        self.assertIsNone(_BAND_URL_RE.search("/noticias/sao-paulo"))


if __name__ == "__main__":
    unittest.main()
