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


    def test_cross_outlet_duplicates_and_fatal_regex(self):
        """Espelho dos casos de duplicação de tests/test_weekly_brief.js."""
        from scraper.utils.risk import classify_risk

        def ms(iso):
            return int(datetime.fromisoformat(iso).timestamp() * 1000)

        now = ms("2026-11-10T18:00:00-03:00")
        same_without_road = [
            {"title": "Carreta tomba e mata motorista na BR-277 em Curitiba - G1", "source": "G1", "created_at": "2026-11-10T08:00:00-03:00"},
            {"title": "Carreta tomba e mata motorista em Curitiba - CNN Brasil", "source": "CNN", "created_at": "2026-11-10T09:00:00-03:00"},
        ]
        self.assertEqual(build_weekly_brief(same_without_road, now)["coverage"]["events"], 1)
        same_without_uf = [
            {"title": "Acidente entre carretas deixa dois mortos na BR-116 em Feira de Santana (BA) - G1", "source": "G1", "created_at": "2026-11-10T08:00:00-03:00"},
            {"title": "Colisão entre caminhões mata duas pessoas na BR-116 - Band", "source": "Band", "created_at": "2026-11-10T10:00:00-03:00"},
        ]
        self.assertEqual(build_weekly_brief(same_without_uf, now)["coverage"]["events"], 1)
        different_days = [
            {"title": "Tombamento de caminhão na Rodovia Raposo Tavares, em Cotia (SP), gera atrasos", "source": "A", "created_at": "2026-11-06T08:00:00-03:00"},
            {"title": "Motorista fica ferido após batida entre carretas na Rodovia Raposo Tavares", "source": "B", "created_at": "2026-11-07T02:00:00-03:00"},
        ]
        self.assertEqual(build_weekly_brief(different_days, now)["coverage"]["events"], 2)
        self.assertFalse(classify_risk({"title": "Carreta tomba na BR-116 na Zona da Mata mineira e trânsito fica lento"})["fatal"])
        self.assertFalse(classify_risk({"title": "Acidente com caminhão perto de incêndio em mata na BR-040"})["fatal"])
        self.assertTrue(classify_risk({"title": "Colisão entre carretas mata motorista na BR-116"})["fatal"])
        self.assertTrue(classify_risk({"title": "Acidente na BR-101 mata 3 pessoas"})["fatal"])

    def test_audit_cases_2026_11_18(self):
        """Espelho dos casos reais da auditoria em tests/test_weekly_brief.js."""
        from scraper.utils.risk import classify_risk

        def ms(iso):
            return int(datetime.fromisoformat(iso).timestamp() * 1000)

        def fatal(title):
            return classify_risk({"title": title})["fatal"]

        # Morte só de animal não conta; morte de pessoa com animal envolvido conta.
        self.assertFalse(fatal("Carreta com 45 bois tomba e três animais morrem na BR-354, em MG"))
        self.assertFalse(fatal("Tombamento de carreta mata três bois e deixa animais feridos em rodovia de Minas Gerais"))
        self.assertFalse(fatal("Cavalo morre atropelado na BR-393, em Barra do Piraí"))
        self.assertFalse(fatal("Acidente com vários veículos na BR-262 deixa mais de 40 animais mortos em Uberaba"))
        self.assertTrue(fatal("Motociclista e cachorro morrem em acidente na rodovia PR-495"))
        self.assertTrue(fatal("Motociclista morre após atropelar cavalo na BR-277; animal também não resistiu"))
        self.assertTrue(fatal("Caminhão com 140 porcos cai em ribanceira e motorista morre na MG-111"))

        now = ms("2026-11-18T12:00:00-03:00")
        # Publicada mais de 2 dias antes da coleta: conta na data de publicação.
        old = [
            {"title": "Acidente deixa 38 mortos na BR-116, em município de Teófilo Otoni (MG)", "source": "A",
             "published_at": "2024-12-21T10:00:00-03:00", "created_at": "2026-11-13T10:00:00-03:00"},
            {"title": "Carreta tomba e mata motorista na BR-381 em Betim, MG", "source": "B",
             "published_at": "2026-11-13T08:00:00-03:00", "created_at": "2026-11-13T10:00:00-03:00"},
        ]
        numbers = {n["key"]: n for n in build_weekly_brief(old, now)["numbers"]}
        self.assertEqual(numbers["fatal"]["value"], 1)

        # ERS-135 e RS-135 são a mesma rodovia.
        same_road = [
            {"title": "Condutora morre em acidente com caminhão na ERS-135, entre Estação e Sertão", "source": "A", "created_at": "2026-11-14T08:00:00-03:00"},
            {"title": "Mulher morre em colisão entre carro e caminhão na RS-135, em Estação", "source": "B", "created_at": "2026-11-14T15:00:00-03:00"},
        ]
        brief = build_weekly_brief(same_road, now)
        self.assertEqual(brief["coverage"]["events"], 1)
        self.assertEqual(brief["highlights"][0]["road"], "RS-135")

        # Coleta parada na semana anterior: sem base de comparação.
        gap = [
            {"title": "Carreta tomba e interdita a BR-116 em Registro, SP", "source": "A", "created_at": "2026-11-09T15:00:00-03:00"},
            {"title": "Carreta tomba e interdita a BR-381 em Betim, MG", "source": "B", "created_at": "2026-11-15T09:00:00-03:00"},
            # Publicada dentro do buraco mas coletada depois: não prova que a coleta funcionou naqueles dias.
            {"title": "Caminhão tomba e interdita a BR-040 em Juiz de Fora, MG", "source": "C",
             "published_at": "2026-11-06T09:00:00-03:00", "created_at": "2026-11-15T09:00:00-03:00"},
        ]
        brief = build_weekly_brief(gap, now)
        self.assertFalse(brief["comparison"]["available"])
        self.assertIn("sem base de comparação com a semana anterior", brief["executive_summary"])

    def test_email_without_comparison(self):
        from scraper.weekly_news import render_weekly_email

        now = int(datetime.fromisoformat("2026-11-18T12:00:00-03:00").timestamp() * 1000)
        items = [{"title": "Carreta tomba e interdita a BR-381 em Betim, MG", "source": "B", "created_at": "2026-11-15T09:00:00-03:00"}]
        body = render_weekly_email(build_weekly_brief(items, now), "18/11/2026 12:00")
        self.assertIn("sem base de comparação", body)
        self.assertNotIn("vs semana anterior", body)


if __name__ == "__main__":
    unittest.main()
