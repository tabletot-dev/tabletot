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


# ---------------------------------------------------------------------------
# Structured facts rendering (migration 0072, finding 3 of
# docs/notes/2026-09-06-order-engine-findings.md) — no DB needed.
# ---------------------------------------------------------------------------

_FACTS_MENU = {
    "categories": [{"id": "Food", "name": "Food"}],
    "items": [
        {
            "id": "avocado_toast", "name": "Avocado Toast", "category": "Food",
            "type": "simple", "price": 300, "tags": ["veg"],
            "description": "Avocado mash on sourdough.",
            "modifiers": {},
            "facts": {
                "calories_kcal": 320,
                "allergens": ["dairy", "gluten"],
                "spice_level": "medium",
                "prep_minutes": 8,
                "ingredients": ["sourdough", "avocado", "chilli flakes"],
            },
        },
        {
            "id": "plain_water", "name": "Water", "category": "Food",
            "type": "simple", "price": 0, "tags": ["veg"],
            "description": None, "modifiers": {}, "facts": None,
        },
    ],
    "aliases": {},
}


def test_facts_rendered_when_present():
    summary = generate_menu_summary(_FACTS_MENU)
    assert "320 kcal" in summary
    assert "contains dairy, gluten" in summary
    assert "spice: medium" in summary
    assert "~8 min" in summary
    assert "ingredients: sourdough, avocado, chilli flakes" in summary


def test_no_facts_bracket_when_facts_absent():
    summary = generate_menu_summary(_FACTS_MENU)
    water_line = next(ln for ln in summary.splitlines() if "Water" in ln)
    assert water_line.strip() == "- Water [V]"  # no facts bracket appended


def test_partial_facts_only_show_present_keys():
    menu = {
        "categories": [{"id": "Food", "name": "Food"}],
        "items": [{
            "id": "x", "name": "Soup", "category": "Food", "type": "simple",
            "price": 100, "tags": ["veg"], "description": None, "modifiers": {},
            "facts": {"prep_minutes": 5},
        }],
        "aliases": {},
    }
    summary = generate_menu_summary(menu)
    assert "[~5 min]" in summary
    assert "kcal" not in summary
    assert "spice" not in summary
