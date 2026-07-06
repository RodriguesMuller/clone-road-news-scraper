import unittest
from datetime import datetime, timezone

from scraper.utils.timezone import brasilia_iso_from_datetime, brasilia_now_iso


class BrasiliaTimezoneTest(unittest.TestCase):
    def test_now_uses_brasilia_offset(self):
        self.assertTrue(brasilia_now_iso().endswith("-03:00"))

    def test_utc_datetime_is_converted_to_brasilia(self):
        converted = brasilia_iso_from_datetime(datetime(2026, 7, 6, 15, 0, tzinfo=timezone.utc))

        self.assertEqual(converted, "2026-07-06T12:00:00-03:00")


if __name__ == "__main__":
    unittest.main()
