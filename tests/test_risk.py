import json
import unittest
from pathlib import Path

from scraper.utils.filters import build_summary
from scraper.utils.risk import classify_risk

GOLDEN = Path(__file__).resolve().parent.parent / "docs" / "domain" / "risk_golden.json"


class RiskGoldenTest(unittest.TestCase):
    def test_golden_dataset(self):
        cases = json.loads(GOLDEN.read_text(encoding="utf-8"))["cases"]
        for case in cases:
            with self.subTest(title=case["title"]):
                result = classify_risk(case)
                self.assertEqual(result["level"], case["expected"], f"{case['title']} -> {result['reason']} ({case['why']})")
                self.assertTrue(result["reason"], "toda classificação precisa de justificativa")

    def test_news_title_with_source_suffix_is_not_turned_into_inmet_alert(self):
        summary = build_summary("Acidente entre dois carros deixa dez vítimas na rodovia Mogi-Guararema - G1", "")
        self.assertNotIn("INMET", summary)

    def test_inmet_title_still_gets_weather_summary(self):
        summary = build_summary("Tempestade - Perigo Potencial", "")
        self.assertIn("INMET", summary)


if __name__ == "__main__":
    unittest.main()
