import unittest

from scripts.upsert_santos_trucker_event import EVENT_METADATA


class CuratedSantosEventTests(unittest.TestCase):
    def test_event_contains_confirmed_start_end_and_timeline(self):
        self.assertEqual(EVENT_METADATA["operational_status"], "encerrado")
        self.assertEqual(EVENT_METADATA["started_on"], "2026-07-13")
        self.assertEqual(EVENT_METADATA["ended_on"], "2026-07-14")
        self.assertEqual(len(EVENT_METADATA["history"]), 4)
        self.assertEqual(EVENT_METADATA["history"][0]["status"], "em_andamento")
        self.assertEqual(EVENT_METADATA["history"][-1]["status"], "encerrado")

    def test_event_has_operational_impact_and_verified_sources(self):
        self.assertIn("seis dos 36 navios", EVENT_METADATA["operational_impact"])
        self.assertIn("não houve bloqueio total", EVENT_METADATA["operational_impact"])
        self.assertGreaterEqual(len(EVENT_METADATA["recommended_actions"]), 3)
        self.assertEqual(len(EVENT_METADATA["evidence"]), 4)
        self.assertTrue(all(item["url"].startswith("https://") for item in EVENT_METADATA["evidence"]))


if __name__ == "__main__":
    unittest.main()
