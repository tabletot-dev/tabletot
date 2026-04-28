"""In-memory order accumulator for multi-turn conversations.

Tracks items added/removed during a conversation. Provides two views:
- summary dict (for LLM context — no IDs, no prices)
- display dict (for CLI — full details)
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class OrderItem:
    item_id: str
    item_name: str
    quantity: int
    unit_price: int
    special_notes: str
    modifiers: list[str]
    category: str


class OrderState:
    def __init__(self) -> None:
        self.items: list[OrderItem] = []
        self.status: str = "building"
        self.language: str = "en"

    def add_item(
        self,
        item_id: str,
        item_name: str,
        quantity: int,
        unit_price: int,
        special_notes: str = "",
        modifiers: list[str] | None = None,
        category: str = "",
    ) -> None:
        """Add item or increment quantity if same id + same notes already exists."""
        for existing in self.items:
            if existing.item_id == item_id and existing.special_notes == special_notes:
                existing.quantity += quantity
                return
        self.items.append(
            OrderItem(
                item_id=item_id,
                item_name=item_name,
                quantity=quantity,
                unit_price=unit_price,
                special_notes=special_notes,
                modifiers=modifiers or [],
                category=category,
            )
        )

    def remove_item(self, item_id: str) -> bool:
        """Remove the first matching item by id. Returns True if found."""
        for i, item in enumerate(self.items):
            if item.item_id == item_id:
                self.items.pop(i)
                return True
        return False

    def modify_quantity(self, item_id: str, new_quantity: int) -> bool:
        """Update quantity of first matching item. Removes if <= 0."""
        for i, item in enumerate(self.items):
            if item.item_id == item_id:
                if new_quantity <= 0:
                    self.items.pop(i)
                else:
                    item.quantity = new_quantity
                return True
        return False

    def update_notes(self, item_id: str, notes: str) -> bool:
        """Update special notes on first matching item."""
        for item in self.items:
            if item.item_id == item_id:
                item.special_notes = notes
                return True
        return False

    def confirm(self) -> bool:
        """Mark order as confirmed. Returns False if empty."""
        if self.is_empty():
            return False
        self.status = "confirmed"
        return True

    def clear(self) -> None:
        """Clear all items and reset to building."""
        self.items.clear()
        self.status = "building"

    def get_total(self) -> int:
        """Calculate total price."""
        return sum(item.unit_price * item.quantity for item in self.items)

    def is_empty(self) -> bool:
        return len(self.items) == 0

    def to_summary_dict(self) -> dict:
        """For LLM context injection. No IDs, no prices."""
        return {
            "items": [
                {
                    "name": item.item_name,
                    "quantity": item.quantity,
                    "notes": item.special_notes,
                }
                for item in self.items
            ]
        }

    def to_display_dict(self) -> dict:
        """For CLI display. Full details."""
        return {
            "items": [
                {
                    "item_id": item.item_id,
                    "item_name": item.item_name,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "line_total": item.unit_price * item.quantity,
                    "special_notes": item.special_notes,
                    "modifiers": item.modifiers,
                    "category": item.category,
                }
                for item in self.items
            ],
            "total": self.get_total(),
            "item_count": sum(item.quantity for item in self.items),
            "status": self.status,
        }
