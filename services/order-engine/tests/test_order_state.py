"""Tests for OrderState — pure data structure, no dependencies."""

from src.order_state import OrderState


def test_add_item():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    assert len(state.items) == 1
    assert state.get_total() == 539


def test_add_duplicate_increments_quantity():
    state = OrderState()
    state.add_item("naan_garlic", "Naan - Garlic", 1, 129, "", [], "indian_breads")
    state.add_item("naan_garlic", "Naan - Garlic", 1, 129, "", [], "indian_breads")
    assert len(state.items) == 1
    assert state.items[0].quantity == 2
    assert state.get_total() == 258


def test_add_same_item_different_notes_creates_new_entry():
    state = OrderState()
    state.add_item("naan_garlic", "Naan - Garlic", 1, 129, "", [], "indian_breads")
    state.add_item("naan_garlic", "Naan - Garlic", 1, 129, "extra butter", [], "indian_breads")
    assert len(state.items) == 2


def test_remove_item():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    assert state.remove_item("butter_chicken") is True
    assert state.is_empty()


def test_remove_nonexistent():
    state = OrderState()
    assert state.remove_item("butter_chicken") is False


def test_modify_quantity():
    state = OrderState()
    state.add_item("naan_garlic", "Naan - Garlic", 2, 129, "", [], "indian_breads")
    state.modify_quantity("naan_garlic", 4)
    assert state.items[0].quantity == 4


def test_modify_quantity_to_zero_removes():
    state = OrderState()
    state.add_item("naan_garlic", "Naan - Garlic", 2, 129, "", [], "indian_breads")
    state.modify_quantity("naan_garlic", 0)
    assert state.is_empty()


def test_modify_nonexistent():
    state = OrderState()
    assert state.modify_quantity("naan_garlic", 3) is False


def test_update_notes():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    assert state.update_notes("butter_chicken", "extra spicy") is True
    assert state.items[0].special_notes == "extra spicy"


def test_update_notes_nonexistent():
    state = OrderState()
    assert state.update_notes("butter_chicken", "extra spicy") is False


def test_confirm_empty_order():
    state = OrderState()
    assert state.confirm() is False


def test_confirm_with_items():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    assert state.confirm() is True
    assert state.status == "confirmed"


def test_clear():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    state.clear()
    assert state.is_empty()
    assert state.status == "building"


def test_summary_dict_no_prices():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    summary = state.to_summary_dict()
    summary_str = str(summary)
    assert "price" not in summary_str
    assert "539" not in summary_str
    assert "id" not in summary_str


def test_display_dict_has_everything():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    state.add_item("naan_garlic", "Naan - Garlic", 2, 129, "", [], "indian_breads")
    d = state.to_display_dict()
    assert d["total"] == 797
    assert d["item_count"] == 3
    assert d["status"] == "building"
    assert len(d["items"]) == 2
    assert d["items"][0]["line_total"] == 539
    assert d["items"][1]["line_total"] == 258


def test_total_calculation():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    state.add_item("naan_garlic", "Naan - Garlic", 2, 129, "", [], "indian_breads")
    assert state.get_total() == 797
