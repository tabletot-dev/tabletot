"""Tests for src/loader.py — exercises against the real menu.json."""

from pathlib import Path

import pytest

from src.loader import MenuIndex, load_menu

MENU_PATH = Path(__file__).parent.parent / "menus" / "roast-ccx-hyd.json"


@pytest.fixture(scope="module")
def index() -> MenuIndex:
    return load_menu(MENU_PATH)


class TestLoaderBasics:
    def test_loads_all_items(self, index: MenuIndex):
        assert len(index.items_by_id) == 285

    def test_loads_aliases(self, index: MenuIndex):
        # Some aliases may collapse after normalization, so allow a small delta.
        assert 150 <= len(index.aliases) <= 200

    def test_loads_categories(self, index: MenuIndex):
        assert len(index.categories) >= 30
        assert "breakfast_platters" in index.categories
        assert index.categories["breakfast_platters"].available_from == "07:00"


class TestIndexEntries:
    def test_simple_item_has_entry(self, index: MenuIndex):
        matches = index.entry_by_normalized("dal makhni")
        assert any(e.item_id == "dal_makhni" and not e.is_variant for e in matches)

    def test_variant_group_has_group_entry(self, index: MenuIndex):
        matches = index.entry_by_normalized("belgian waffle")
        assert any(
            e.item_id == "belgian_waffle" and e.requires_variant_selection
            for e in matches
        )

    def test_variant_child_has_compound_entry_both_orderings(self, index: MenuIndex):
        # variant + group order
        forward = index.entry_by_normalized("nutella and banana belgian waffle")
        # group + variant order
        backward = index.entry_by_normalized("belgian waffle nutella and banana")
        assert any(e.item_id == "belgian_waffle_nutella_banana" for e in forward)
        assert any(e.item_id == "belgian_waffle_nutella_banana" for e in backward)

    def test_variant_child_has_short_form_entry(self, index: MenuIndex):
        # "Nutella & Banana" alone should be present too
        matches = index.entry_by_normalized("nutella and banana")
        # Multiple variant groups share this name; we just need at least one.
        assert len(matches) >= 1


class TestAliases:
    def test_normalized_alias_lookup(self, index: MenuIndex):
        assert index.aliases.get("black dal") == "dal_makhni"
        assert index.aliases.get("kaapi") == "south_indian_filter_coffee"

    def test_alias_to_variant_group(self, index: MenuIndex):
        # "garlic naan" maps to a specific variant id
        target = index.aliases.get("garlic naan")
        assert target == "naan_garlic"
        kind, _ = index.lookup_alias_target(target)
        assert kind == "variant"


class TestModifiers:
    def test_item_with_modifier_in_index(self, index: MenuIndex):
        matches = index.entry_by_normalized("fresh lime soda")
        assert matches
        assert any(e.requires_modifier and "style" in e.requires_modifier for e in matches)


class TestVariants:
    def test_variant_lookup(self, index: MenuIndex):
        v = index.variants_by_id.get("belgian_waffle_nutella_banana")
        assert v is not None
        assert v.parent_id == "belgian_waffle"
        assert v.price == 379
