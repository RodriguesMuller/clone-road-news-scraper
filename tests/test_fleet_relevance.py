import unittest

from scraper.utils.filters import fleet_relevance, is_fleet_relevant


class FleetRelevanceTest(unittest.TestCase):
    def test_keeps_news_that_change_route_decisions(self):
        relevant = [
            "Carreta tomba e BR-116 fica totalmente bloqueada em Registro",
            "Protesto de caminhoneiros bloqueia rodovia em Sinop",
            "Queda de barreira interdita estrada na Serra do Mar",
            "Roubo de carga: quadrilha ataca caminhão na Via Dutra",
            "Neblina reduz visibilidade e PRF orienta motoristas na BR-277",
            "Rodovia SP-055 é liberada após acidente",
            "Obras causam pare e siga no km 230 da BR-101",
        ]
        for title in relevant:
            with self.subTest(title=title):
                self.assertTrue(is_fleet_relevant(title), title)

    def test_drops_road_news_without_operational_impact(self):
        irrelevant = [
            "Prefeitura inaugura nova praça às margens da rodovia",
            "Concessionária lança aplicativo com programa de fidelidade",
            "Atriz relembra acidente de carro em novela",
            "Avião faz pouso de emergência perto de estrada",
            "Estrada da vida: cantor lança novo álbum",
            "Acidente doméstico deixa criança ferida",
        ]
        for title in irrelevant:
            with self.subTest(title=title):
                self.assertFalse(is_fleet_relevant(title), title)

    def test_summary_can_supply_missing_context(self):
        self.assertTrue(is_fleet_relevant("Trânsito parado por 3 horas", "Engavetamento na BR-381 envolve 5 caminhões"))

    def test_returns_reasons(self):
        reasons = fleet_relevance("BR-163 interditada por protesto")
        self.assertTrue(any(reason.startswith("contexto") for reason in reasons))
        self.assertTrue(any(reason.startswith("impacto") for reason in reasons))


if __name__ == "__main__":
    unittest.main()
