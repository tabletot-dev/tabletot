"""Tests for src/time_check.py — Silver SSC has no time windows."""

from datetime import datetime

import pytest

from src.loader import load_menu_from_db
from src.time_check import check_availability

_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
_RESTAURANT_ID = "b22b5d53-6dd8-4f5b-8276-2e828cd1ab91"


@pytest.fixture(scope="module")
def index():
    return load_menu_from_db(_DB_URL, _RESTAURANT_ID)


def _at(year, month, day, hh, mm):
    return datetime(year, month, day, hh, mm)


class TestHighTea:
    def test_available_monday_four_pm(self, index):
        high_tea_items = [
            i for i in index.items_by_id.values() if i.category == "high_tea"
        ]
        if not high_tea_items:
            pytest.skip("No high_tea items in menu")
        item = high_tea_items[0]
        assert check_availability(item, index, _at(2026, 4, 13, 16, 0)) is None

    def test_unavailable_saturday(self, index):
        high_tea_items = [
            i for i in index.items_by_id.values() if i.category == "high_tea"
        ]
        if not high_tea_items:
            pytest.skip("No high_tea items in menu")
        item = high_tea_items[0]
        reason = check_availability(item, index, _at(2026, 4, 18, 16, 0))
        assert reason is not None
        assert "Mon-Fri" in reason

    def test_unavailable_morning(self, index):
        high_tea_items = [
            i for i in index.items_by_id.values() if i.category == "high_tea"
        ]
        if not high_tea_items:
            pytest.skip("No high_tea items in menu")
        item = high_tea_items[0]
        reason = check_availability(item, index, _at(2026, 4, 13, 10, 0))
        assert reason is not None
        assert "15:00-19:00" in reason


class TestUnrestricted:
    def test_all_items_always_available(self, index):
        # Silver SSC has no time windows — all items are available at all hours
        for item in index.items_by_id.values():
            assert check_availability(item, index, _at(2026, 4, 14, 3, 0)) is None
            assert check_availability(item, index, _at(2026, 4, 14, 23, 0)) is None

    def test_none_time_skips_check(self, index):
        item = index.items_by_id["cappuccino"]
        assert check_availability(item, index, None) is None
