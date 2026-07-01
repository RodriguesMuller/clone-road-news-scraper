import unittest

from scraper.utils.filters import build_summary, clean_text, extract_region


class RegionExtractionTest(unittest.TestCase):
    def test_region_examples(self):
        cases = {
            "Acidente interdita trecho da BR-364 em Cuiab\u00e1": "Cuiab\u00e1/MT",
            "Manifesta\u00e7\u00e3o bloqueia rodovia em Paul\u00ednia, no interior de S\u00e3o Paulo": "Paul\u00ednia/SP",
            "BR-163 registra lentid\u00e3o em Mato Grosso": "BR-163 - MT",
            "Obras causam interdi\u00e7\u00e3o parcial na Rodovia Anhanguera sentido interior": "Rodovia Anhanguera - sentido interior",
            "Chuva forte causa pontos de alagamento em S\u00e3o Paulo": "S\u00e3o Paulo/SP",
            "Acidente causa lentid\u00e3o em trecho de rodovia federal": "N\u00e3o identificado",
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(extract_region(text), expected)

    def test_html_entities_are_cleaned(self):
        self.assertEqual(
            clean_text("BR-364&nbsp&nbsp &amp; <b>teste</b> &quot;x&quot;"),
            'BR-364 & teste "x"',
        )

    def test_summary_keeps_content_after_region(self):
        self.assertEqual(
            build_summary("Tempestade - Perigo", "", region="Par\u00e1"),
            "Na regi\u00e3o do Par\u00e1, h\u00e1 alerta de tempestade com perigo, conforme aviso meteorol\u00f3gico publicado pelo INMET.",
        )
        self.assertEqual(
            build_summary("Acidente interdita trecho da BR-364 em Cuiab\u00e1", "", region="Cuiab\u00e1/MT"),
            "Na regi\u00e3o de Cuiab\u00e1/MT, acidente interdita trecho da BR-364 em Cuiab\u00e1",
        )
        self.assertEqual(
            build_summary("BR-163 registra lentid\u00e3o em Mato Grosso", "", region="Mato Grosso"),
            "Na regi\u00e3o de Mato Grosso, BR-163 registra lentid\u00e3o em Mato Grosso",
        )

    def test_bare_region_summary_uses_fallback(self):
        self.assertEqual(
            build_summary("Tempestade - Perigo", "Na regi\u00e3o de Par\u00e1,", region="Par\u00e1"),
            "Na regi\u00e3o do Par\u00e1, h\u00e1 alerta de tempestade com perigo, conforme aviso meteorol\u00f3gico publicado pelo INMET.",
        )


if __name__ == "__main__":
    unittest.main()
