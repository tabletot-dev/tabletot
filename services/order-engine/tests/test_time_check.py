"""Tests for src/time_check.py."""

from datetime import datetime
from pathlib import Path

import pytest

from src.loader import load_menu
from src.time_check import check_availability

MENU_PATH = Path(__file__).parent.parent / "menus" / "silver-ssc-hyd.json"


@pytest.fixture(scope="module")
def index():
    return load_menu(MENU_PATH)


def _at(year, month, day, hh, mm):
    return datetime(year, month, day, hh, mm)


class TestBreakfast:
    def test_available_at_eight_am(self, index):
        item = index.items_by_id["english_breakfast"]
        # Tuesday 2026-04-14, 8 AM — should be available
        assert check_availability(item, index, _at(2026, 4, 14, 8, 0)) is None

    def test_unavailable_at_two_pm(self, index):
        item = index.items_by_id["english_breakfast"]
        reason = check_availability(item, index, _at(2026, 4, 14, 14, 0))
        assert reason is not None
        assert "07:00-11:00" in reason

    def test_available_on_weekend_morning(self, index):
        item = index.items_by_id["english_breakfast"]
        # Saturday 9 AM — breakfast runs all 7 days
        assert check_availability(item, index, _at(2026, 4, 18, 9, 0)) is None


class TestHighTea:
    def test_available_monday_four_pm(self, index):
        # Find an item in the high_tea category
        high_tea_items = [
            i for i in index.items_by_id.values() if i.category == "high_tea"
        ]
        if not high_tea_items:
            pytest.skip("No high_tea items in menu")
        item = high_tea_items[0]
        # Monday 2026-04-13, 16:00
        assert check_availability(item, index, _at(2026, 4, 13, 16, 0)) is None

    def test_unavailable_saturday(self, index):
        high_tea_items = [
            i for i in index.items_by_id.values() if i.category == "high_tea"
        ]
        if not high_tea_items:
            pytest.skip("No high_tea items in menu")
        item = high_tea_items[0]
        # Saturday 2026-04-18, 16:00 — high tea is Mon-Fri only
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
    def test_no_window_always_available(self, index):
        item = index.items_by_id["dal_makhni"]
        assert check_availability(item, index, _at(2026, 4, 14, 3, 0)) is None
        assert check_availability(item, index, _at(2026, 4, 18, 23, 0)) is None

    def test_none_time_skips_check(self, index):
        item = index.items_by_id["english_breakfast"]
        assert check_availability(item, index, None) is None


class TestVariantInheritsParent:
    def test_variant_uses_parent_category(self, index):
        # Belgian waffle is in sweets_and_toasts (no window) — variants should inherit
        v = index.variants_by_id["belgian_waffle_nutella_banana"]
        assert check_availability(v, index, _at(2026, 4, 14, 14, 0)) is None
