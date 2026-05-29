"""Tests for menu summary generation — no prices, no IDs, correct structure."""

from src.llm.prompts.menu_summary import generate_menu_summary
from src.loader import load_menu_data_from_db

_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
_RESTAURANT_ID = "b22b5d53-6dd8-4f5b-8276-2e828cd1ab91"


def _load_menu() -> dict:
    return load_menu_data_from_db(_DB_URL, _RESTAURANT_ID)


def test_no_prices_in_summary():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    for item in menu_data["items"]:
        price = item.get("price")
        if price:
            assert f"₹{price}" not in summary, f"Found price ₹{price} in summary"


def test_no_ids_in_summary():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    for item_id in ["avocado_toast", "cappuccino", "silver_cold_brew", "teas"]:
        assert item_id not in summary, f"Found ID {item_id} in summary"


def test_contains_category_names():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    for cat in menu_data["categories"]:
        assert cat["name"] in summary, f"Missing category: {cat['name']}"


def test_contains_item_names():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    for name in ["Avocado Toast", "Cappuccino", "Silver Espresso", "Teas"]:
        assert name in summary, f"Missing item: {name}"


def test_modifier_options_shown():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Teas has a tea_choice modifier with Spearmint/Green Tea/Chamomile/Blue Pea
    assert "Spearmint" in summary


def test_veg_nonveg_tags():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    assert "[V]" in summary
    assert "[NV]" in summary


def test_modifiers_shown():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Teas modifier shows tea type choices
    assert "Choose your tea" in summary


def test_descriptions_shown():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    # Avocado Toast has a description
    assert "sourdough" in summary


def test_summary_not_empty():
    menu_data = _load_menu()
    summary = generate_menu_summary(menu_data)
    assert len(summary) > 500
