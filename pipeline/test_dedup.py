import unittest
from pipeline.dedup import are_duplicates


class DedupTests(unittest.TestCase):
    def setUp(self):
        self.event_a = {
            "title": "Free Pizza Night",
            "org": "Computer Science Club",
            "date": "2026-11-14",
            "location": "Price Center",
        }

    def test_same_event_is_duplicate(self):
        event_b = {
            "title": "Free Pizza Night",
            "org": "Computer Science Club",
            "date": "2026-11-14",
            "location": "Price Center",
        }
        self.assertTrue(are_duplicates(self.event_a, event_b))

    def test_different_dates_are_not_duplicates(self):
        event_b = dict(self.event_a, date="2026-11-15")
        self.assertFalse(are_duplicates(self.event_a, event_b))

    def test_different_locations_are_not_duplicates(self):
        event_b = dict(self.event_a, location="RIMAC")
        self.assertFalse(are_duplicates(self.event_a, event_b))

    def test_missing_date_is_not_duplicate(self):
        event_b = dict(self.event_a, date=None)
        self.assertFalse(are_duplicates(self.event_a, event_b))


if __name__ == "__main__":
    unittest.main()
