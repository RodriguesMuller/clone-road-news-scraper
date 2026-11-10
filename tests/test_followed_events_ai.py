"""Atualização por IA dos eventos acompanhados (scraper/followed_events.py)."""

import unittest

from scraper.followed_events import apply_update, select_candidates

SEED = {
    "title": "Carreta tomba e bloqueia totalmente a BR-282 em Lages",
    "summary": "Bloqueio total nos dois sentidos no km 210 da BR-282, sem previsão de liberação.",
    "url": "https://example.com/origem",
    "published_at": "2026-11-10T08:00:00-03:00",
}
NEWS = [
    {"title": "BR-282 segue bloqueada em Lages; filas de caminhões passam de 8 km", "summary": "PRF trabalha na retirada da carreta.", "url": "https://example.com/segue", "published_at": "2026-11-10T10:00:00-03:00"},
    {"title": "BR-282 é liberada após retirada de carreta em Lages", "summary": "Trânsito normalizado nos dois sentidos.", "url": "https://example.com/liberada", "published_at": "2026-11-10T14:00:00-03:00"},
    {"title": "Chuva forte causa alagamentos em Porto Alegre", "summary": "Defesa Civil emite alerta.", "url": "https://example.com/chuva", "published_at": "2026-11-10T11:00:00-03:00"},
    {"title": "Colisão na BR-101 em Joinville deixa trânsito lento", "summary": "Acidente no km 40.", "url": "https://example.com/br101", "published_at": "2026-11-10T12:00:00-03:00"},
]
NOW = "2026-11-10T18:00:00+00:00"


def ai_result(**overrides):
    result = {
        "related_urls": ["https://example.com/segue"], "status": "em_andamento",
        "summary": "A BR-282 segue bloqueada em Lages.", "operational_impact": "Caminhões não passam pelo km 210.",
        "dispatch_decision": "segurar", "recommended_actions": ["Segurar saídas para a BR-282 em Lages"],
        "detour": "", "estimated_duration": "", "timeline_note": "PRF informa filas de 8 km.",
    }
    result.update(overrides)
    return result


class FollowedEventsAiTests(unittest.TestCase):
    def test_candidates_are_same_road_or_place_and_skip_known(self):
        event = {"seed": SEED, "ai_state": {"related": [{"url": "https://example.com/segue"}]}}
        urls = [item["url"] for item in select_candidates(event, NEWS)]
        self.assertEqual(urls, ["https://example.com/liberada"], "já relacionada, chuva e outra rodovia ficam de fora")

    def test_ai_can_only_cite_news_it_received(self):
        event = {"seed": SEED, "ai_state": {}}
        candidates = select_candidates(event, NEWS)
        update = apply_update(event, ai_result(related_urls=["https://example.com/segue", "https://inventada.example/x"]), candidates, "m", NOW)
        self.assertEqual([item["url"] for item in update["ai_state"]["related"]], ["https://example.com/segue"])
        self.assertIn("https://example.com/liberada", update["ai_state"]["rejected_urls"], "candidata recusada não volta a ser enviada")
        self.assertEqual((update["status"], update["ai_state"]["dispatch_decision"]), ("active", "segurar"))
        self.assertEqual(update["ai_state"]["history"][-1]["note"], "PRF informa filas de 8 km.")

    def test_ai_closes_only_with_explicit_release_news(self):
        event = {"seed": SEED, "ai_state": {"status": "em_andamento", "analyzed_at": "x"}}
        candidates = select_candidates(event, NEWS)
        no_proof = apply_update(event, ai_result(status="encerrado", related_urls=["https://example.com/segue"]), candidates, "m", NOW)
        self.assertEqual(no_proof["status"], "active", "sem notícia de liberação, não encerra")
        closed = apply_update(event, ai_result(status="encerrado", related_urls=["https://example.com/liberada"], timeline_note="Via liberada."), candidates, "m", NOW)
        self.assertEqual((closed["status"], closed["closed_at"]), ("closed", NOW))
        self.assertEqual(closed["ai_state"]["dispatch_decision"], "liberar_com_atencao")

    def test_invalid_dispatch_keeps_previous_or_holds(self):
        event = {"seed": SEED, "ai_state": {"dispatch_decision": "liberar_com_desvio"}}
        self.assertEqual(apply_update(event, ai_result(dispatch_decision="xyz"), [], "m", NOW)["ai_state"]["dispatch_decision"], "liberar_com_desvio")
        self.assertEqual(apply_update({"seed": SEED, "ai_state": {}}, ai_result(dispatch_decision="xyz"), [], "m", NOW)["ai_state"]["dispatch_decision"], "segurar")


if __name__ == "__main__":
    unittest.main()
