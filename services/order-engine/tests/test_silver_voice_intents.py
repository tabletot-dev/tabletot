"""Functional intent tests for the Silver Specialty Coffee kiosk.

Uses MockProvider (no API calls, no audio) to verify that the orchestrator
correctly handles the intents a customer would speak at the table.

Each test corresponds to a real kiosk scenario:
  - Add a single item
  - Add multiple items in one utterance
  - Remove an item
  - Modify quantity (modify_item)
  - Ambiguous input (multiple matches)
  - No match (item not on menu)
  - Ask about the menu (no order change)
  - Full multi-turn happy path: add → modify → remove → confirm

Menu reference: menus/silver-ssc-hyd.json
Run from: services/order-engine/
  pytest tests/test_silver_voice_intents.py -v
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import json

import pytest

from src.llm.base import LLMProvider, LLMResponse
from src.loader import load_menu
from src.models import Ambiguous, ConfidentMatch, NoMatch
from src.orchestrator import Orchestrator


# ---------------------------------------------------------------------------
# Shared mock + helpers
# ---------------------------------------------------------------------------


class MockProvider(LLMProvider):
    """Feeds scripted intent responses; generate_response always returns 'ok'."""

    def __init__(self, responses: list[LLMResponse]) -> None:
        self._responses = list(responses)
        self._idx = 0

    def extract_intents(self, transcript, menu_context, conversation_history,
                        resolver_feedback=None, order_state=None) -> LLMResponse:
        r = self._responses[self._idx % len(self._responses)]
        self._idx += 1
        return r

    def generate_response(self, transcript, menu_context, conversation_history,
                          extracted_intents, turn_outcomes, current_order,
                          detected_language, voice_persona=None) -> LLMResponse:
        return LLMResponse(
            intents=[],
            response_text="ok",
            detected_language=detected_language,
            raw_output="ok",
            model="mock",
            provider="mock",
            prompt_tokens=0,
            completion_tokens=0,
        )

    def get_provider_name(self) -> str:
        return "mock"


def _resp(intents: list[dict], text: str = "ok") -> LLMResponse:
    return LLMResponse(
        intents=intents,
        response_text=text,
        detected_language="en",
        raw_output="raw",
        model="mock",
        provider="mock",
        prompt_tokens=0,
        completion_tokens=0,
    )


def _intent(action: str, raw_name: str, quantity: int = 1,
            modifiers: list | None = None, notes: str = "") -> dict:
    return {
        "action": action,
        "raw_name": raw_name,
        "quantity": quantity,
        "modifiers": modifiers or [],
        "special_notes": notes,
    }


MENU_PATH = "menus/silver-ssc-hyd.json"


def _build(responses: list[LLMResponse]) -> Orchestrator:
    menu_data = json.loads(Path(MENU_PATH).read_text(encoding="utf-8"))
    index = load_menu(MENU_PATH)
    return Orchestrator(MockProvider(responses), index, menu_data)


def _now() -> datetime:
    return datetime.now()


# ---------------------------------------------------------------------------
# Single add
# ---------------------------------------------------------------------------


def test_add_cappuccino():
    orch = _build([_resp([_intent("add_item", "cappuccino")])])
    result = orch.process_turn("ek cappuccino dena", _now())

    assert len(result.resolver_results) == 1
    rr = result.resolver_results[0]
    assert isinstance(rr.result, ConfidentMatch)
    assert rr.applied_to_order is True

    items = result.order_state_snapshot["items"]
    assert len(items) == 1
    assert items[0]["item_name"] == "Cappuccino"
    assert items[0]["quantity"] == 1
    assert items[0]["unit_price"] == 240


def test_add_cold_brew():
    orch = _build([_resp([_intent("add_item", "silver cold brew")])])
    result = orch.process_turn("silver cold brew chahiye", _now())

    items = result.order_state_snapshot["items"]
    assert items[0]["item_name"] == "Silver Cold Brew"
    assert items[0]["unit_price"] == 290


def test_add_avocado_toast():
    orch = _build([_resp([_intent("add_item", "avocado toast")])])
    result = orch.process_turn("avocado toast please", _now())

    assert result.resolver_results[0].applied_to_order is True
    assert result.order_state_snapshot["items"][0]["item_name"] == "Avocado Toast"


# ---------------------------------------------------------------------------
# Multi-item add in one utterance
# ---------------------------------------------------------------------------


def test_add_multiple_items():
    orch = _build([_resp([
        _intent("add_item", "cappuccino", quantity=1),
        _intent("add_item", "avocado toast", quantity=1),
    ])])
    result = orch.process_turn("cappuccino aur avocado toast", _now())

    assert len(result.resolver_results) == 2
    assert all(r.applied_to_order for r in result.resolver_results)
    assert result.order_state_snapshot["item_count"] == 2
    assert result.order_state_snapshot["total"] == 240 + 390


def test_add_multiple_quantity():
    orch = _build([_resp([_intent("add_item", "classic fries", quantity=2)])])
    result = orch.process_turn("do classic fries", _now())

    items = result.order_state_snapshot["items"]
    assert items[0]["quantity"] == 2
    assert items[0]["unit_price"] == 215
    assert result.order_state_snapshot["total"] == 430


# ---------------------------------------------------------------------------
# Remove
# ---------------------------------------------------------------------------


def test_remove_item():
    orch = _build([
        _resp([_intent("add_item", "latte")]),
        _resp([_intent("remove_item", "latte")]),
    ])
    orch.process_turn("ek latte", _now())
    result = orch.process_turn("latte cancel karo", _now())

    assert result.resolver_results[0].applied_to_order is True
    assert result.order_state_snapshot["total"] == 0
    assert result.order_state_snapshot["item_count"] == 0


def test_remove_item_not_in_order_gives_feedback():
    orch = _build([_resp([_intent("remove_item", "latte")])])
    result = orch.process_turn("latte hatao", _now())

    assert result.resolver_results[0].applied_to_order is False
    assert result.pending_feedback is not None
    assert result.pending_feedback[0]["type"] == "not_in_order"


# ---------------------------------------------------------------------------
# Modify quantity
# ---------------------------------------------------------------------------


def test_modify_quantity_up():
    orch = _build([
        _resp([_intent("add_item", "cappuccino", quantity=1)]),
        _resp([_intent("modify_item", "cappuccino", quantity=2)]),
    ])
    orch.process_turn("ek cappuccino", _now())
    result = orch.process_turn("make it two cappuccinos", _now())

    assert result.resolver_results[0].applied_to_order is True
    items = result.order_state_snapshot["items"]
    assert items[0]["quantity"] == 2
    assert result.order_state_snapshot["total"] == 480


def test_modify_quantity_down():
    orch = _build([
        _resp([_intent("add_item", "classic fries", quantity=3)]),
        _resp([_intent("modify_item", "classic fries", quantity=1)]),
    ])
    orch.process_turn("teen classic fries", _now())
    result = orch.process_turn("sirf ek fries rakhna", _now())

    items = result.order_state_snapshot["items"]
    assert items[0]["quantity"] == 1


# ---------------------------------------------------------------------------
# Ambiguous / no match / ask_menu
# ---------------------------------------------------------------------------


def test_ambiguous_bagel_not_added():
    """'bagel' matches both Veggie Bagel and Egg Bagel at equal score.
    Should not be added; should surface pending_feedback for the LLM to clarify.

    Silver resolver notes:
    - 'coffee'   → confident match to Silver Cold Coffee (fuzzy_partial)
    - 'espresso' → confident match to Silver Espresso (alias)
    - 'bagel'    → Ambiguous (Veggie Bagel / Egg Bagel, both score=100)
    """
    orch = _build([_resp([_intent("add_item", "bagel")])])
    result = orch.process_turn("ek bagel dena", _now())

    rr = result.resolver_results[0]
    assert rr.applied_to_order is False
    assert isinstance(rr.result, Ambiguous)
    assert result.pending_feedback is not None


def test_no_match_masala_dosa():
    orch = _build([_resp([_intent("add_item", "masala dosa")])])
    result = orch.process_turn("masala dosa dena", _now())

    rr = result.resolver_results[0]
    assert rr.applied_to_order is False
    assert isinstance(rr.result, NoMatch)
    assert result.pending_feedback[0]["type"] == "no_match"


def test_ask_menu_does_not_modify_order():
    orch = _build([_resp([_intent("ask_menu", "smoothie bowls", quantity=0)])])
    result = orch.process_turn("smoothie bowls mein kya hai?", _now())

    assert len(result.resolver_results) == 0
    assert result.order_state_snapshot["total"] == 0


# ---------------------------------------------------------------------------
# Confirm order
# ---------------------------------------------------------------------------


def test_confirm_empty_order_gives_feedback():
    orch = _build([_resp([_intent("confirm_order", "", quantity=0)])])
    result = orch.process_turn("confirm", _now())

    assert result.pending_feedback is not None
    assert result.pending_feedback[0]["type"] == "empty_order"


def test_confirm_with_items():
    orch = _build([
        _resp([_intent("add_item", "cappuccino")]),
        _resp([_intent("confirm_order", "", quantity=0)]),
    ])
    orch.process_turn("cappuccino", _now())
    result = orch.process_turn("haan confirm karo", _now())

    assert result.order_state_snapshot["status"] == "confirmed"
    assert result.pending_feedback is None


# ---------------------------------------------------------------------------
# Full multi-turn happy path
# ---------------------------------------------------------------------------


def test_full_kiosk_conversation():
    """
    Turn 1: Add cappuccino + avocado toast
    Turn 2: Modify cappuccino qty to 2
    Turn 3: Remove avocado toast
    Turn 4: Confirm
    Expected final order: 2× Cappuccino = ₹480, status=confirmed
    """
    orch = _build([
        _resp([
            _intent("add_item", "cappuccino", quantity=1),
            _intent("add_item", "avocado toast", quantity=1),
        ]),
        _resp([_intent("modify_item", "cappuccino", quantity=2)]),
        _resp([_intent("remove_item", "avocado toast")]),
        _resp([_intent("confirm_order", "", quantity=0)]),
    ])

    # Turn 1
    r1 = orch.process_turn("cappuccino aur avocado toast", _now())
    assert r1.order_state_snapshot["item_count"] == 2

    # Turn 2
    r2 = orch.process_turn("cappuccino do kar do", _now())
    cap = next(i for i in r2.order_state_snapshot["items"] if "Cappuccino" in i["item_name"])
    assert cap["quantity"] == 2

    # Turn 3
    r3 = orch.process_turn("avocado toast hatao", _now())
    assert r3.order_state_snapshot["item_count"] == 2  # 2× cappuccino
    assert all("Cappuccino" in i["item_name"] for i in r3.order_state_snapshot["items"])

    # Turn 4
    r4 = orch.process_turn("haan confirm", _now())
    assert r4.order_state_snapshot["status"] == "confirmed"
    assert r4.order_state_snapshot["total"] == 480
