"""Tests for src/resolver.py — the matching cascade against Silver SSC menu."""

from datetime import datetime

import pytest

from src.models import (
    Ambiguous,
    ConfidentMatch,
    NeedsVariantSelection,
    NoMatch,
    Unavailable,
)
from src.resolver import resolve

from src.loader import load_menu_from_db

_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
_RESTAURANT_ID = "b22b5d53-6dd8-4f5b-8276-2e828cd1ab91"


@pytest.fixture(scope="module")
def index():
    return load_menu_from_db(_DB_URL, _RESTAURANT_ID)


class TestStep1Exact:
    def test_avocado_toast(self, index):
        r = resolve("avocado toast", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "avocado_toast"
        assert r.match_method == "exact"
        assert r.score == 100.0

    def test_cappuccino(self, index):
        r = resolve("cappuccino", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "cappuccino"

    def test_with_filler_words(self, index):
        r = resolve("ek cappuccino please", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "cappuccino"


class TestStep2Alias:
    def test_alias_to_simple_item(self, index):
        r = resolve("avo toast", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "avocado_toast"
        assert r.match_method == "alias"

    def test_cold_brew_alias(self, index):
        r = resolve("cold brew", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "silver_cold_brew"

    def test_pancakes_alias(self, index):
        r = resolve("pancakes", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "original_pancakes"


class TestStep3Fuzzy:
    def test_misspelled_cappuccino(self, index):
        r = resolve("cappucino", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "cappuccino"

    def test_misspelled_nashville(self, index):
        r = resolve("nasvhille chicken", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "nashville_chicken_burger"


class TestAmbiguous:
    def test_iced(self, index):
        r = resolve("iced", index)
        # "iced" matches iced_long_black, iced_latte, iced_mocha → always ambiguous
        assert isinstance(r, Ambiguous)
        assert len(r.candidates) >= 2

    def test_coffee(self, index):
        r = resolve("coffee", index)
        # Accept any resolved result — Silver SSC has many coffee items
        assert isinstance(r, (Ambiguous, ConfidentMatch, NeedsVariantSelection))
        if isinstance(r, Ambiguous):
            assert len(r.candidates) >= 2


class TestNoMatch:
    def test_masala_dosa(self, index):
        r = resolve("masala dosa", index)
        assert isinstance(r, NoMatch)

    def test_empty_input(self, index):
        r = resolve("", index)
        assert isinstance(r, NoMatch)

    def test_single_char(self, index):
        r = resolve("x", index)
        assert isinstance(r, NoMatch)


class TestModifiers:
    def test_teas_has_modifier(self, index):
        r = resolve("tea", index)
        assert isinstance(r, ConfidentMatch)
        assert r.item_id == "teas"
        assert r.requires_modifier is not None
        assert "tea_choice" in r.requires_modifier


class TestUnavailable:
    def test_all_items_always_available(self, index):
        # Silver SSC has no time windows — every item is available at all hours
        afternoon = datetime(2026, 4, 14, 14, 0)
        for item_id, item in index.items_by_id.items():
            r = resolve(item.name, index, afternoon)
            assert not isinstance(r, Unavailable), f"{item_id} should be available at 14:00"


class TestPureFunction:
    def test_no_state_between_calls(self, index):
        r1 = resolve("avocado toast", index)
        r2 = resolve("avocado toast", index)
        assert r1.item_id == r2.item_id  # type: ignore[union-attr]
        assert r1.score == r2.score  # type: ignore[union-attr]
