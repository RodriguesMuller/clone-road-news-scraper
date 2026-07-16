import unittest

from scraper.event_intelligence import _fingerprint, _valid_events, candidate_reasons, select_event_candidates


class EventIntelligenceTests(unittest.TestCase):
    def test_unrelated_strike_is_rejected(self):
        item = {
            "title": "Greve de professores suspende aulas na rede estadual",
            "summary": "A categoria reivindica reajuste salarial.",
            "source": "Portal local",
        }
        self.assertEqual(candidate_reasons(item), [])

    def test_trucker_port_blockade_is_selected(self):
        item = {
            "title": "Paralisação de caminhoneiros bloqueia acesso ao Porto de Santos",
            "summary": "Filas impedem a entrada de cargas e interrompem operações no terminal.",
            "source": "Fonte portuária",
            "url": "https://example.com/santos",
        }
        self.assertIn("impacto operacional", candidate_reasons(item))
        self.assertEqual(len(select_event_candidates([item])), 1)

    def test_hormuz_closure_is_selected_as_strategic(self):
        item = {
            "title": "Strait of Hormuz closure disrupts tanker traffic",
            "summary": "Shipping is halted and vessels are rerouted after the blockade.",
            "source": "International source",
            "url": "https://example.com/hormuz",
        }
        self.assertIn("infraestrutura estratégica", candidate_reasons(item))

    def test_fingerprint_is_stable_when_candidates_change_order(self):
        first = {
            "url": "https://example.com/a", "title": "A", "summary": "Impacto A", "published_at": "2026-07-16"
        }
        second = {
            "url": "https://example.com/b", "title": "B", "summary": "Impacto B", "published_at": "2026-07-16"
        }
        self.assertEqual(
            _fingerprint([first, second], "gpt-4.1-mini"),
            _fingerprint([second, first], "gpt-4.1-mini"),
        )

    def test_resolution_wording_is_preserved_for_ai_review(self):
        item = {
            "title": "Caminhoneiros encerram paralisação no Porto de Santos",
            "summary": "A movimentação de cargas será retomada nos terminais.",
            "source": "Fonte portuária",
        }
        self.assertIn("possível encerramento", candidate_reasons(item))

    def test_routine_weather_warning_without_logistics_impact_is_rejected(self):
        item = {
            "title": "Chuvas intensas - Perigo",
            "summary": "Chuva de até 50 mm por dia e ventos intensos no Amazonas.",
            "source": "INMET - Avisos Meteorológicos",
            "type": "INMET",
        }
        self.assertEqual(candidate_reasons(item), [])

    def test_event_requires_real_evidence_and_high_confidence(self):
        candidate = {
            "title": "Paralisação bloqueia o Porto de Santos",
            "summary": "Caminhoneiros interrompem o acesso de cargas ao terminal.",
            "source": "Fonte A",
            "url": "https://example.com/evento",
            "published_at": "2026-07-16T10:00:00-03:00",
            "category": "evento logístico",
            "screening_reasons": ["contexto logístico", "impacto operacional", "gravidade"],
        }
        payload = {
            "events": [{
                "is_major_event": True,
                "event_key": "porto-santos-paralisacao",
                "title": "Paralisação afeta o Porto de Santos",
                "category": "Paralisação",
                "scope": "nacional",
                "severity": "critical",
                "status": "em_andamento",
                "confidence": 0.93,
                "country": "Brasil",
                "location": "Santos/SP",
                "affected_infrastructure": ["Acessos ao Porto de Santos"],
                "operational_impact": "Entrada de cargas interrompida e formação de filas nos acessos portuários.",
                "summary": "O acesso de caminhões ao porto está bloqueado.",
                "why_major": ["Bloqueio de infraestrutura estratégica"],
                "recommended_actions": ["Reprogramar janelas de entrega"],
                "evidence": [{"url": candidate["url"]}],
            }]
        }
        self.assertEqual(len(_valid_events(payload, [candidate], [])), 1)
        payload["events"][0]["evidence"] = [{"url": "https://invented.example/event"}]
        self.assertEqual(_valid_events(payload, [candidate], []), [])

    def test_event_cannot_close_without_explicit_resolution(self):
        candidate = {
            "title": "Bloqueio segue no Porto de Santos",
            "summary": "Caminhoneiros mantêm os acessos fechados.",
            "source": "Fonte A",
            "url": "https://example.com/continua",
            "published_at": "2026-07-16T11:00:00-03:00",
            "category": "evento logístico",
            "screening_reasons": ["contexto logístico", "impacto operacional", "gravidade"],
        }
        event = {
            "is_major_event": True,
            "event_key": "porto-santos-paralisacao",
            "title": "Paralisação no Porto de Santos",
            "category": "Paralisação",
            "scope": "nacional",
            "severity": "critical",
            "status": "encerrado",
            "confidence": 0.95,
            "location": "Santos/SP",
            "affected_infrastructure": ["Porto de Santos"],
            "operational_impact": "Fluxo de cargas interrompido nos acessos ao complexo portuário.",
            "evidence": [{"url": candidate["url"]}],
        }
        self.assertEqual(_valid_events({"events": [event]}, [candidate], []), [])

        candidate["title"] = "Acessos ao Porto de Santos são liberados após fim da paralisação"
        candidate["summary"] = "Tráfego normalizado e operações retomadas no terminal."
        self.assertEqual(len(_valid_events({"events": [event]}, [candidate], [])), 1)


if __name__ == "__main__":
    unittest.main()
