import unittest

from scraper.event_intelligence import _fingerprint, _valid_events, candidate_reasons, merge_event, select_event_candidates


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


def _classified(status="em_andamento", published_at="2026-11-10T08:00:00-03:00", note=""):
    return {
        "event_key": "porto-santos-paralisacao", "title": "Paralisação no Porto de Santos", "category": "Paralisação",
        "scope": "nacional", "severity": "critical", "operational_status": status, "confidence": 0.95,
        "country": "Brasil", "location": "Santos/SP", "affected_infrastructure": ["Porto de Santos"],
        "operational_impact": "Fluxo de cargas interrompido nos acessos ao porto.", "summary": "", "why_major": [],
        "recommended_actions": [], "detour": "", "estimated_duration": "", "timeline_note": note,
        "evidence": [{"title": "t", "url": "https://example.com/a", "source": "s", "published_at": published_at}],
    }


class MergeEventTests(unittest.TestCase):
    NOW = "2026-11-10T15:00:00+00:00"

    def _closed_by_manager(self, closed_at="2026-11-10T12:00:00+00:00"):
        return {"id": "e1", "resolved_at": closed_at, "metadata": {
            "event_key": "porto-santos-paralisacao", "operational_status": "encerrado", "ended_at": closed_at,
            "status_confirmed_by": "platform_manager", "last_update_at": closed_at, "history": []}}

    def test_ai_does_not_reopen_event_closed_by_manager_with_old_news(self):
        merged = merge_event(_classified(published_at="2026-11-10T08:00:00-03:00"), self._closed_by_manager(), "m", self.NOW)
        self.assertIsNone(merged)

    def test_ai_reopens_event_closed_by_manager_with_newer_news(self):
        merged = merge_event(_classified(published_at="2026-11-10T11:00:00-03:00"), self._closed_by_manager(), "m", self.NOW)
        self.assertEqual(merged["db_status"], "open")
        self.assertNotIn("ended_at", merged["metadata"], "reaberto não mostra data de encerramento antiga")

    def test_closed_event_keeps_original_closing_date(self):
        previous = {"id": "e1", "resolved_at": "2026-11-09T10:00:00+00:00", "metadata": {
            "operational_status": "encerrado", "ended_at": "2026-11-09T10:00:00+00:00", "history": []}}
        merged = merge_event(_classified(status="encerrado"), previous, "m", self.NOW)
        self.assertEqual(merged["resolved_at"], "2026-11-09T10:00:00+00:00")
        self.assertEqual(merged["metadata"]["ended_at"], "2026-11-09T10:00:00+00:00")

    def test_new_closure_records_closing_date(self):
        previous = {"id": "e1", "resolved_at": None, "metadata": {"operational_status": "em_andamento", "history": []}}
        merged = merge_event(_classified(status="encerrado"), previous, "m", self.NOW)
        self.assertEqual((merged["db_status"], merged["resolved_at"], merged["metadata"]["ended_at"]), ("resolved", self.NOW, self.NOW))

    def test_start_is_oldest_news_by_real_date(self):
        event = _classified()
        event["evidence"] = [
            {"title": "a", "url": "u1", "source": "s", "published_at": "2026-11-09T22:00:00-03:00"},
            {"title": "b", "url": "u2", "source": "s", "published_at": "2026-11-10T00:30:00+00:00"},
        ]
        # A segunda é 21:30 de 09/11 em Brasília (mais antiga), embora o texto "2026-11-09..." venha antes.
        merged = merge_event(event, None, "m", self.NOW)
        self.assertEqual(merged["metadata"]["started_at"], "2026-11-10T00:30:00+00:00")


class CargoRelevanceTests(unittest.TestCase):
    """A Central é para eventos que obrigam o gestor de frota de CARGA a replanejar."""

    def test_partial_accident_affecting_only_buses_is_not_major(self):
        # Caso real de produção (10/11/2026): virou evento "Crítico" na Central.
        item = {
            "title": "Caminhão carregado de legumes tomba na Raposo Tavares e provoca congestionamento e paralisação de linhas de ônibus",
            "summary": "Um caminhão carregado de legumes tombou na madrugada desta terça-feira no km 24,5 da Rodovia Raposo Tavares, "
                       "provocando interdição parcial da via, congestionamento e paralisação de linhas de ônibus metropolitanos.",
            "source": "G1 - SP",
            "url": "https://example.com/raposo",
        }
        self.assertEqual(candidate_reasons(item), [])
        self.assertEqual(select_event_candidates([item]), [])

    def test_bus_strike_is_not_cargo_event(self):
        item = {"title": "Greve de ônibus paralisa linhas e congestiona avenidas de São Paulo",
                "summary": "Trânsito intenso nas rodovias de acesso à capital.", "source": "Portal"}
        self.assertEqual(candidate_reasons(item), [])

    def test_accident_with_total_block_without_forecast_is_still_candidate(self):
        item = {"title": "Carreta tomba e bloqueio total interdita a BR-116 nos dois sentidos",
                "summary": "Via segue fechada sem previsão de liberação; filas de caminhões passam de 10 km.",
                "source": "PRF", "url": "https://example.com/br116"}
        self.assertTrue(candidate_reasons(item))

    def test_trucker_strike_is_still_candidate(self):
        item = {"title": "Greve de caminhoneiros bloqueia rodovias e paralisa o transporte de cargas no Sul",
                "summary": "Pontos de bloqueio em três estados; filas e desabastecimento.", "source": "Portal"}
        self.assertTrue(candidate_reasons(item))

    def test_manager_dismissed_event_is_never_republished(self):
        previous = {"id": "e1", "resolved_at": "2026-11-10T18:00:00+00:00", "metadata": {
            "operational_status": "descartado", "status_confirmed_by": "platform_manager",
            "last_update_at": "2026-11-10T18:00:00+00:00", "history": []}}
        self.assertIsNone(merge_event(_classified(published_at="2026-11-11T10:00:00-03:00"), previous, "m", "2026-11-11T14:00:00+00:00"))


if __name__ == "__main__":
    unittest.main()
