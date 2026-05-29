"""Tests for Orchestrator — uses MockProvider, no API calls."""

from src.llm.base import LLMProvider, LLMResponse
from src.loader import load_menu_data_from_db, load_menu_from_db
from src.models import ConfidentMatch
from src.orchestrator import Orchestrator

_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
_RESTAURANT_ID = "b22b5d53-6dd8-4f5b-8276-2e828cd1ab91"


class MockProvider(LLMProvider):
    """Two-pass mock. `responses` feeds pass 1 (intent extraction); pass 2
    returns a deterministic string so tests don't need to script both calls."""

    def __init__(self, responses: list[LLMResponse]):
        self.responses = list(responses)
        self.call_count = 0
        self.last_inputs: list[dict] = []
        self.last_response_inputs: list[dict] = []

    def extract_intents(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        self.last_inputs.append({
            "transcript": transcript,
            "resolver_feedback": resolver_feedback,
            "order_state": order_state,
        })
        response = self.responses[self.call_count % len(self.responses)]
        self.call_count += 1
        return response

    def generate_response(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        extracted_intents: list[dict],
        turn_outcomes: list[dict],
        current_order: dict | None,
        detected_language: str,
        voice_persona: str | None = None,
    ) -> LLMResponse:
        self.last_response_inputs.append({
            "transcript": transcript,
            "extracted_intents": extracted_intents,
            "turn_outcomes": turn_outcomes,
            "current_order": current_order,
            "detected_language": detected_language,
        })
        return LLMResponse(
            intents=[],
            response_text="mock reply",
            detected_language=detected_language,
            raw_output="mock reply",
            model="mock",
            provider="mock",
            prompt_tokens=0,
            completion_tokens=0,
        )

    def get_provider_name(self) -> str:
        return "mock"


def _make_response(intents: list[dict], text: str = "ok") -> LLMResponse:
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


def _build_orchestrator(responses: list[LLMResponse]) -> tuple[Orchestrator, MockProvider]:
    menu_data = load_menu_data_from_db(_DB_URL, _RESTAURANT_ID)
    index = load_menu_from_db(_DB_URL, _RESTAURANT_ID)
    provider = MockProvider(responses)
    orch = Orchestrator(provider, index, menu_data)
    return orch, provider


def test_single_item_add():
    resp = _make_response(
        [{"action": "add_item", "raw_name": "cappuccino", "quantity": 1, "modifiers": [], "special_notes": ""}],
        "Cappuccino, done!",
    )
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("one cappuccino please")

    assert len(result.resolver_results) == 1
    assert result.resolver_results[0].applied_to_order is True
    assert isinstance(result.resolver_results[0].result, ConfidentMatch)
    items = result.order_state_snapshot["items"]
    assert len(items) == 1
    assert items[0]["item_name"] == "Cappuccino"
    assert items[0]["quantity"] == 1


def test_multi_item_add():
    resp = _make_response([
        {"action": "add_item", "raw_name": "cappuccino", "quantity": 1, "modifiers": [], "special_notes": ""},
        {"action": "add_item", "raw_name": "classic fries", "quantity": 2, "modifiers": [], "special_notes": ""},
    ])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("cappuccino aur do classic fries")

    assert len(result.resolver_results) == 2
    assert all(r.applied_to_order for r in result.resolver_results)
    assert result.order_state_snapshot["item_count"] == 3


def test_ambiguous_generates_feedback():
    resp = _make_response(
        [{"action": "add_item", "raw_name": "iced", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("ek iced")

    # "iced" is ambiguous — matches iced_long_black, iced_latte, iced_mocha
    assert len(result.resolver_results) == 1
    assert result.resolver_results[0].applied_to_order is False
    assert result.pending_feedback is not None
    assert len(result.pending_feedback) >= 1
    fb_type = result.pending_feedback[0]["type"]
    assert fb_type in ("ambiguous", "needs_variant")


def test_ambiguity_feedback_sent_to_llm_on_next_turn():
    resp1 = _make_response(
        [{"action": "add_item", "raw_name": "iced", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    resp2 = _make_response(
        [{"action": "add_item", "raw_name": "iced latte", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    orch, provider = _build_orchestrator([resp1, resp2])

    orch.process_turn("ek iced")
    orch.process_turn("iced latte")

    # Second LLM call should have received the ambiguity feedback from turn 1
    assert provider.last_inputs[1]["resolver_feedback"] is not None


def test_remove_item():
    add_resp = _make_response(
        [{"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    remove_resp = _make_response(
        [{"action": "remove_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    orch, _ = _build_orchestrator([add_resp, remove_resp])

    orch.process_turn("butter chicken")
    result = orch.process_turn("cancel butter chicken")

    assert result.resolver_results[0].applied_to_order is True
    assert result.order_state_snapshot["total"] == 0


def test_remove_item_not_in_order():
    remove_resp = _make_response(
        [{"action": "remove_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    orch, _ = _build_orchestrator([remove_resp])
    result = orch.process_turn("cancel butter chicken")

    # Should generate not_in_order feedback
    assert result.pending_feedback is not None
    assert result.pending_feedback[0]["type"] == "not_in_order"


def test_confirm_empty_order():
    resp = _make_response(
        [{"action": "confirm_order", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}],
    )
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("confirm")

    assert result.pending_feedback is not None
    assert result.pending_feedback[0]["type"] == "empty_order"


def test_confirm_with_items():
    add_resp = _make_response(
        [{"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    confirm_resp = _make_response(
        [{"action": "confirm_order", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}],
    )
    orch, _ = _build_orchestrator([add_resp, confirm_resp])

    orch.process_turn("butter chicken")
    result = orch.process_turn("confirm")

    assert result.order_state_snapshot["status"] == "confirmed"
    assert result.pending_feedback is None


def test_no_match_generates_feedback():
    resp = _make_response(
        [{"action": "add_item", "raw_name": "masala dosa", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("masala dosa")

    assert result.resolver_results[0].applied_to_order is False
    assert result.pending_feedback is not None
    assert result.pending_feedback[0]["type"] == "no_match"


def test_special_notes_preserved():
    resp = _make_response(
        [{"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": "extra spicy"}],
    )
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("butter chicken extra spicy")

    items = result.order_state_snapshot["items"]
    assert items[0]["special_notes"] == "extra spicy"


def test_conversation_history_grows():
    resp = _make_response(
        [{"action": "none", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}],
        "Hello!",
    )
    orch, _ = _build_orchestrator([resp])
    orch.process_turn("hello")

    assert len(orch.conversation_history) == 2
    assert orch.conversation_history[0]["role"] == "user"
    assert orch.conversation_history[1]["role"] == "assistant"


def test_reset_clears_state():
    add_resp = _make_response(
        [{"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    orch, _ = _build_orchestrator([add_resp])
    orch.process_turn("butter chicken")
    orch.reset()

    assert orch.order_state.is_empty()
    assert orch.conversation_history == []
    assert orch.pending_feedback is None
    assert orch.turn_count == 0


def test_ask_menu_no_resolver_call():
    resp = _make_response(
        [{"action": "ask_menu", "raw_name": "shakshouka", "quantity": 0, "modifiers": [], "special_notes": ""}],
        "Shakshouka is a Mediterranean egg dish",
    )
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("what is shakshouka?")

    assert len(result.resolver_results) == 0
    assert result.order_state_snapshot["total"] == 0


def test_order_state_sent_to_llm_after_add():
    resp1 = _make_response(
        [{"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}],
    )
    resp2 = _make_response(
        [{"action": "none", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}],
    )
    orch, provider = _build_orchestrator([resp1, resp2])

    orch.process_turn("butter chicken")
    orch.process_turn("hmm")

    # Second call should have order state
    assert provider.last_inputs[1]["order_state"] is not None
    assert len(provider.last_inputs[1]["order_state"]["items"]) == 1
