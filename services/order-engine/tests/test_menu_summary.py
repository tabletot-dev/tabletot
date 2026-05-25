"""Tests for menu summary generation — no prices, no IDs, correct structure."""

import json
from pathlib import Path

from src.llm.prompts.menu_summary import generate_menu_summary


def _load_menu() -> dict:
    return json.loads(Path("menus/silver-ssc-hyd.json").read_text(encoding="utf-8"))


def test_no_prices_in_summary():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Prices are integers like 539, 129, 999 — none should appear
    for item in menu_data["items"]:
        price = item.get("price")
        if price:
            assert f"₹{price}" not in summary, f"Found price ₹{price} in summary"


def test_no_ids_in_summary():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Check a sample of IDs that should NOT appear
    for item_id in ["butter_chicken", "naan_garlic", "english_breakfast", "dal_makhni"]:
        assert item_id not in summary, f"Found ID {item_id} in summary"


def test_contains_category_names():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    for cat in menu_data["categories"]:
        assert cat["name"] in summary, f"Missing category: {cat['name']}"


def test_contains_item_names():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Check a sample of item names
    for name in ["Butter Chicken", "Dal Makhni", "English Breakfast", "Belgian Waffle"]:
        assert name in summary, f"Missing item: {name}"


def test_variant_groups_show_options():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Belgian Waffle should show "choose: Nutella & Banana, Classic"
    assert "choose:" in summary
    assert "Nutella & Banana" in summary


def test_time_windows_shown():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    assert "07:00-11:00" in summary  # Breakfast Platters
    assert "15:00-19:00" in summary  # High Tea


def test_veg_nonveg_tags():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    assert "[V]" in summary
    assert "[NV]" in summary


def test_modifiers_shown():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Fresh Lime Soda has a Salt/Sweet modifier
    assert "Salt/Sweet" in summary


def test_descriptions_shown():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # English Breakfast has a description
    assert "Eggs Benedict" in summary


def test_summary_not_empty():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    assert len(summary) > 500  # Should be substantial
