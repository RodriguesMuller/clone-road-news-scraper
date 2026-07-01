import unittest

from scraper.utils.filters import build_summary


class SummaryGenerationTest(unittest.TestCase):
    def test_summary_keeps_region_and_weather_content(self):
        summary = build_summary(
            "Tempestade - Perigo",
            "INMET publica aviso iniciando em: 01/07/2026 09:00. "
            "Chuva entre 20 e 30 mm/h, ventos intensos e risco de alagamentos. "
            "Áreas afetadas: Pará",
        )

        self.assertTrue(summary.startswith("Na região do Pará,"))
        self.assertIn("chuva entre 20 e 30 mm/h", summary)
        self.assertNotEqual(summary, "Na região do Pará")

    def test_summary_uses_title_when_original_summary_is_empty(self):
        summary = build_summary("Acidente interdita trecho da BR-364 em Cuiabá", "")

        self.assertTrue(summary.startswith("Na região da BR-364,"))
        self.assertIn("acidente interdita trecho da BR-364", summary)

    def test_summary_removes_html_entities(self):
        summary = build_summary(
            "BR-163 registra lentidão em Mato Grosso",
            "BR-163&nbsp&nbsp registra lentidão &amp; operação pare-e-siga em Mato Grosso.",
        )

        self.assertNotIn("&nbsp", summary)
        self.assertNotIn("&amp", summary)
        self.assertNotIn("  ", summary)
        self.assertIn("Mato Grosso", summary)

    def test_summary_strips_redundant_route_prefix(self):
        summary = build_summary(
            "Trânsito na BR-163",
            "BR-163 registra lentidão e operação pare-e-siga em Mato Grosso.",
        )

        self.assertEqual(
            "Na região da BR-163, registra lentidão e operação pare-e-siga em Mato Grosso.",
            summary,
        )

    def test_summary_strips_redundant_state_prefix(self):
        summary = build_summary(
            "Chuvas em Pará",
            "Áreas afetadas: Pará, chuva intensa e raios isolados.",
        )

        self.assertEqual(
            "Na região do Pará, chuva intensa e raios isolados.",
            summary,
        )


if __name__ == "__main__":
    unittest.main()
