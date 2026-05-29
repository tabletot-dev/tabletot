"""Tests for src/loader.py — exercises against the Silver SSC DB."""

import pytest

from src.loader import MenuIndex, load_menu_from_db

_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
_RESTAURANT_ID = "b22b5d53-6dd8-4f5b-8276-2e828cd1ab91"


@pytest.fixture(scope="module")
def index() -> MenuIndex:
    return load_menu_from_db(_DB_URL, _RESTAURANT_ID)


class TestLoaderBasics:
    def test_loads_all_items(self, index: MenuIndex):
        assert len(index.items_by_id) == 49

    def test_loads_aliases(self, index: MenuIndex):
        # 77 aliases seeded in migration 0029; allow a small delta for normalization collisions
        assert 70 <= len(index.aliases) <= 80

    def test_loads_categories(self, index: MenuIndex):
        assert len(index.categories) == 14
        assert "All Day Breakfast" in index.categories
        # Silver SSC has no time windows — categories are all-day
        assert index.categories["All Day Breakfast"].available_from is None


class TestIndexEntries:
    def test_simple_item_has_entry(self, index: MenuIndex):
        matches = index.entry_by_normalized("avocado toast")
        assert any(e.item_id == "avocado_toast" and not e.is_variant for e in matches)

    def test_all_items_have_entries(self, index: MenuIndex):
        for item_id in index.items_by_id:
            assert any(e.item_id == item_id for e in index.entries), f"No entry for {item_id}"

    def test_no_variant_groups(self, index: MenuIndex):
        # Silver SSC menu has only simple items — no variant groups
        for item in index.items_by_id.values():
            assert item.type == "simple"
        assert len(index.variants_by_id) == 0


class TestAliases:
    def test_normalized_alias_lookup(self, index: MenuIndex):
        assert index.aliases.get("avo toast") == "avocado_toast"
        assert index.aliases.get("cold brew") == "silver_cold_brew"

    def test_multiple_aliases_same_target(self, index: MenuIndex):
        # "pancakes", "classic pancakes", "original pancakes" all → original_pancakes
        assert index.aliases.get("pancakes") == "original_pancakes"
        assert index.aliases.get("classic pancakes") == "original_pancakes"
        assert index.aliases.get("original pancakes") == "original_pancakes"


class TestModifiers:
    def test_item_with_modifier_in_index(self, index: MenuIndex):
        matches = index.entry_by_normalized("teas")
        assert matches
        assert any(e.requires_modifier and "tea_choice" in e.requires_modifier for e in matches)
