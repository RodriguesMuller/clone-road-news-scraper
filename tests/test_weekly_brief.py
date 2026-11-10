import json
import unittest
from datetime import datetime
from pathlib import Path

from scraper.weekly_brief import build_weekly_brief

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class WeeklyBriefParityTest(unittest.TestCase):
    def test_matches_js_expected_output(self):
        fixture = json.loads((FIXTURES / "weekly_items.json").read_text(encoding="utf-8"))
        expected = json.loads((FIXTURES / "weekly_brief_expected.json").read_text(encoding="utf-8"))
        now_ms = int(datetime.fromisoformat(fixture["now"]).timestamp() * 1000)
        self.maxDiff = None
        self.assertEqual(build_weekly_brief(fixture["items"], now_ms), expected)

    def test_email_has_every_section_and_escapes_titles(self):
        from scraper.weekly_news import render_weekly_email

        fixture = json.loads((FIXTURES / "weekly_items.json").read_text(encoding="utf-8"))
        now_ms = int(datetime.fromisoformat(fixture["now"]).timestamp() * 1000)
        items = fixture["items"] + [{"title": "<script>x</script> Carreta tomba e interdita a BR-116 em Registro, SP", "source": "X", "created_at": fixture["now"]}]
        body = render_weekly_email(build_weekly_brief(items, now_ms), "10/11/2026 18:00")
        for section in ("Atenção para os próximos dias", "O que fazer esta semana", "Trechos mais críticos da semana",
                        "Segurança da carga", "Clima (avisos INMET)", "Principais ocorrências"):
            self.assertIn(section, body)
        self.assertNotIn("<script>x</script>", body)


if __name__ == "__main__":
    unittest.main()
