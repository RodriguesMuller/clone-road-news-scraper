import unittest

from scraper.utils.image_summary import build_image_summary_fallback


class ImageSummaryFallbackTest(unittest.TestCase):
    def test_fallback_removes_html_and_finishes_sentence(self):
        result = build_image_summary_fallback({
            "title": "Tempestade - Perigo",
            "summary": "&nbsp&nbsp",
            "source": "INMET - Avisos Meteorológicos",
            "region": "Pará",
            "category": "Clima",
        })

        self.assertNotIn("&nbsp", result["image_summary"])
        self.assertRegex(result["image_summary"], r"[.!?]$")
        self.assertNotRegex(result["image_summary"], r"\b(de|do|da|dos|das|em|para|com|e)[,.:;]?$")

    def test_international_news_has_low_operational_relevance(self):
        result = build_image_summary_fallback({
            "title": "Tesla Semi se envolve no primeiro acidente fatal em rodovia dos Estados Unidos",
            "summary": "O caminhão elétrico Tesla Semi teve o primeiro registro de acidente grave em rodovia pública dos",
            "source": "Blog do Caminhoneiro",
        })

        self.assertEqual(result["country"], "Estados Unidos")
        self.assertEqual(result["category"], "Internacional")
        self.assertEqual(result["operational_relevance"], "Baixa")
        self.assertIn("sem impacto operacional direto", result["operational_impact"].lower())

    def test_brazilian_road_news_identifies_highway(self):
        result = build_image_summary_fallback({
            "title": "Acidente interdita trecho da BR-364 em Cuiabá",
            "summary": "Acidente causa lentidão e bloqueio parcial no trecho.",
            "source": "G1 - Brasil",
        })

        self.assertEqual(result["highway"], "BR-364")
        self.assertEqual(result["category"], "Acidente")
        self.assertEqual(result["risk_level"], "Alto")


if __name__ == "__main__":
    unittest.main()
