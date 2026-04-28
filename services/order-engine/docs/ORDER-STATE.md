# Order State — Specification

## Purpose

A simple in-memory accumulator that tracks the running order during a conversation. Both the LLM (for context) and the CLI (for display) read from this.

---

## OrderItem Dataclass

```python
@dataclass
class OrderItem:
    item_id: str
    item_name: str
    quantity: int
    unit_price: int         # price per unit in rupees
    special_notes: str      # "less spicy", "extra cheese", etc.
    modifiers: list[str]    # ["pour over"], ["oat milk"], etc.
    category: str
```

---

## OrderState Class

```python
class OrderState:
    items: list[OrderItem]
    status: str              # "building" | "confirmed"
    language: str            # detected language from conversation
```

### Methods

**`add_item(item_id, item_name, quantity, unit_price, special_notes, modifiers, category)`**

If an item with the SAME `item_id` AND SAME `special_notes` already exists, increment its quantity. Otherwise, add as a new entry. This handles "ek aur naan" (add another of the same) vs "ek naan extra butter" (new entry because notes differ).

**`remove_item(item_id: str) -> bool`**

Remove the first matching item by ID. Returns True if found and removed, False if not in order. If there are multiple entries with the same ID (different notes), removes the first one.

**`modify_quantity(item_id: str, new_quantity: int) -> bool`**

Update quantity of the first matching item. If `new_quantity <= 0`, remove the item entirely. Returns True if found.

**`update_notes(item_id: str, notes: str) -> bool`**

Update special notes on the first matching item. Returns True if found.

**`confirm() -> bool`**

Set status to "confirmed". Returns False if order is empty (can't confirm empty order).

**`clear()`**

Remove all items, reset status to "building".

**`get_total() -> int`**

Sum of `unit_price * quantity` for all items.

**`is_empty() -> bool`**

True if no items in order.

**`to_summary_dict() -> dict`**

For LLM context injection. Contains item names and quantities ONLY — no IDs, no prices. The LLM doesn't need financial data.

```python
{
    "items": [
        {"name": "Butter Chicken", "quantity": 1, "notes": ""},
        {"name": "Naan (Garlic)", "quantity": 2, "notes": "extra butter"},
    ]
}
```

**`to_display_dict() -> dict`**

For CLI display. Contains everything including IDs, prices, totals.

```python
{
    "items": [
        {
            "item_id": "butter_chicken",
            "item_name": "Butter Chicken",
            "quantity": 1,
            "unit_price": 539,
            "line_total": 539,
            "special_notes": "",
            "modifiers": [],
            "category": "Indian Curries & Rice"
        },
        {
            "item_id": "naan_garlic",
            "item_name": "Naan - Garlic",
            "quantity": 2,
            "unit_price": 129,
            "line_total": 258,
            "special_notes": "extra butter",
            "modifiers": [],
            "category": "Indian Breads"
        }
    ],
    "total": 797,
    "item_count": 3,
    "status": "building"
}
```

---

## Test Cases

```python
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
    assert "price" not in str(summary)
    assert "539" not in str(summary)
    assert "id" not in str(summary)

def test_total_calculation():
    state = OrderState()
    state.add_item("butter_chicken", "Butter Chicken", 1, 539, "", [], "indian_curries")
    state.add_item("naan_garlic", "Naan - Garlic", 2, 129, "", [], "indian_breads")
    assert state.get_total() == 797
```
