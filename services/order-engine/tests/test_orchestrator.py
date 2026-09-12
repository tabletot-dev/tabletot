"""Tests for Orchestrator — uses MockProvider, no API calls."""

from src.llm.base import LLMProvider, LLMResponse
from src.loader import load_menu_data_from_db, load_menu_from_db
from src.menu_graph import AnchorEntry, MenuGraph
from src.models import ChooseFromCategory, ConfidentMatch
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


def _build_orchestrator(
    responses: list[LLMResponse],
    menu_graph: MenuGraph | None = None,
) -> tuple[Orchestrator, MockProvider]:
    menu_data = load_menu_data_from_db(_DB_URL, _RESTAURANT_ID)
    index = load_menu_from_db(_DB_URL, _RESTAURANT_ID)
    provider = MockProvider(responses)
    orch = Orchestrator(provider, index, menu_data, menu_graph=menu_graph)
    return orch, provider


def _make_graph(
    anchors: list[AnchorEntry] | None = None,
    pairings: dict[str, list[str]] | None = None,
) -> MenuGraph:
    return MenuGraph(anchors=anchors or [], pairings=pairings or {})


def _filter_intent(attribute: str, category: str = "") -> dict:
    return {
        "action": "filter",
        "attribute": attribute,
        "category": category,
        "raw_name": "",
        "quantity": 0,
        "modifiers": [],
        "special_notes": "",
    }


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


# ---------------------------------------------------------------------------
# Browse category (Track C)
# ---------------------------------------------------------------------------


def test_browse_category_finds_items():
    resp = _make_response([{"action": "browse_category", "raw_name": "hot coffee", "quantity": 0, "modifiers": [], "special_notes": ""}])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("hot coffee section dikhao")

    assert len(result.resolver_results) == 1
    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    assert rr.result.category == "Hot Coffee"
    assert rr.applied_to_order is False
    assert result.order_state_snapshot["total"] == 0
    item_names = {o.item_name for o in rr.result.options}
    # Hot Coffee has 6 items: Latte, Cappuccino, Mocha, Long Black, Cortado, Flat White
    assert len(item_names) == 6
    assert "Cappuccino" in item_names


def test_browse_category_fuzzy_match():
    """'smoothie bowl' (singular) fuzzy-matches 'Smoothie Bowls' via token_sort_ratio ≥ 75."""
    resp = _make_response([{"action": "browse_category", "raw_name": "smoothie bowl", "quantity": 0, "modifiers": [], "special_notes": ""}])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("smoothie bowl dikhao")

    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    assert rr.result.category == "Smoothie Bowls"
    assert len(rr.result.options) > 0


def test_browse_unknown_category_falls_back():
    resp = _make_response([{"action": "browse_category", "raw_name": "pizza", "quantity": 0, "modifiers": [], "special_notes": ""}])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("pizza section")

    # Unknown category → menu_question outcome, no resolver_results
    assert len(result.resolver_results) == 0
    assert result.order_state_snapshot["total"] == 0
    assert result.pending_feedback is None


# ---------------------------------------------------------------------------
# Filter (Track D)
# ---------------------------------------------------------------------------


def test_filter_veg_returns_only_veg_items():
    resp = _make_response([_filter_intent("veg")])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("veg items dikhao")

    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    assert rr.applied_to_order is False
    veg_ids = {iid for iid, item in orch.menu_index.items_by_id.items() if "veg" in item.tags}
    for opt in rr.result.options:
        assert opt.item_id in veg_ids, f"{opt.item_name} is not a veg item"


def test_filter_non_veg_returns_only_nonveg_items():
    resp = _make_response([_filter_intent("non-veg")])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("non-veg items kya hain?")

    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    nonveg_ids = {iid for iid, item in orch.menu_index.items_by_id.items() if "non-veg" in item.tags}
    for opt in rr.result.options:
        assert opt.item_id in nonveg_ids, f"{opt.item_name} is not a non-veg item"
    assert len(rr.result.options) == 5


def test_filter_with_category_narrows_results():
    resp = _make_response([_filter_intent("veg", category="Fries")])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("veg fries dikhao")

    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    # All 3 Fries items are veg → all 3 returned
    assert len(rr.result.options) == 3
    for opt in rr.result.options:
        assert opt.category == "Fries"


def test_filter_nonveg_in_fries_gives_no_match():
    """All Fries are veg → filtering non-veg in Fries yields no items → no_match outcome."""
    resp = _make_response([_filter_intent("non-veg", category="Fries")])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("non-veg fries hain kya?")

    # 0 options → no resolver_results; no_match outcome appended internally
    assert len(result.resolver_results) == 0
    assert result.order_state_snapshot["total"] == 0


# ---------------------------------------------------------------------------
# Recommend (Track E)
# ---------------------------------------------------------------------------


def test_recommend_named_item_not_added_to_order():
    """recommend intent for a specific item must surface it as a suggestion, never add to cart."""
    resp = _make_response([{"action": "recommend", "raw_name": "cappuccino", "quantity": 0, "modifiers": [], "special_notes": ""}])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("cappuccino suggest karo")

    assert len(result.resolver_results) == 1
    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    assert rr.applied_to_order is False
    assert result.order_state_snapshot["total"] == 0


def test_recommend_uses_cart_pairings():
    """When cart has avocado_toast, recommend should surface its pairings (cappuccino, silver_cold_brew)."""
    add_resp = _make_response([{"action": "add_item", "raw_name": "avocado toast", "quantity": 1, "modifiers": [], "special_notes": ""}])
    rec_resp = _make_response([{"action": "recommend", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}])
    graph = _make_graph(pairings={"avocado_toast": ["cappuccino", "silver_cold_brew"]})
    orch, _ = _build_orchestrator([add_resp, rec_resp], menu_graph=graph)

    orch.process_turn("avocado toast")
    result = orch.process_turn("kuch aur suggest karo")

    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    assert rr.applied_to_order is False
    option_names = {o.item_name for o in rr.result.options}
    assert "Cappuccino" in option_names or "Silver Cold Brew" in option_names
    assert result.order_state_snapshot["item_count"] == 1  # only avocado toast in cart


def test_recommend_falls_back_to_anchors_when_cart_empty():
    resp = _make_response([{"action": "recommend", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}])
    graph = _make_graph(anchors=[
        AnchorEntry("avocado_toast", "Avocado Toast", "chef_pick", 1),
        AnchorEntry("affogato", "Affogato", "chef_pick", 2),
    ])
    orch, _ = _build_orchestrator([resp], menu_graph=graph)
    result = orch.process_turn("kuch suggest karo")

    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    assert rr.applied_to_order is False
    option_names = {o.item_name for o in rr.result.options}
    assert "Avocado Toast" in option_names
    assert result.order_state_snapshot["total"] == 0


def test_recommend_no_graph_falls_back_gracefully():
    """With no MenuGraph, recommend should degrade to a menu_question (no resolver_results)."""
    resp = _make_response([{"action": "recommend", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}])
    orch, _ = _build_orchestrator([resp], menu_graph=None)
    result = orch.process_turn("kuch suggest karo")

    assert len(result.resolver_results) == 0
    assert result.order_state_snapshot["total"] == 0


def test_ask_menu_named_item_surfaces_as_unapplied_suggestion():
    """ask_menu for a real item should resolve it so the client can show a
    card, but never add it to the order (this is a question, not an add)."""
    resp = _make_response([{"action": "ask_menu", "raw_name": "cappuccino", "quantity": 0, "modifiers": [], "special_notes": ""}])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("cappuccino mein kya hai?")

    assert len(result.resolver_results) == 1
    rr = result.resolver_results[0]
    assert isinstance(rr.result, ConfidentMatch)
    assert rr.applied_to_order is False
    assert result.order_state_snapshot["total"] == 0


def test_ask_menu_unresolved_name_falls_back_to_menu_question():
    """A question that doesn't name a real menu item should degrade to a
    plain menu_question with no resolver_results, same as before."""
    resp = _make_response([{"action": "ask_menu", "raw_name": "does this place have wifi", "quantity": 0, "modifiers": [], "special_notes": ""}])
    orch, _ = _build_orchestrator([resp])
    result = orch.process_turn("does this place have wifi?")

    assert len(result.resolver_results) == 0
    assert result.order_state_snapshot["total"] == 0


def _recommend_intent(attribute: str = "", raw_name: str = "") -> dict:
    return {
        "action": "recommend",
        "raw_name": raw_name,
        "attribute": attribute,
        "quantity": 0,
        "modifiers": [],
        "special_notes": "",
    }


def test_recommend_veg_filters_mixed_anchor_list():
    """Client-reported bug: "give me vegetarian options" surfaced a non-veg
    anchor item (Egg Bagel) as a suggested card. With no cart pairings to
    fall back to, a veg-constrained recommend must only surface veg anchors,
    never the non-veg ones mixed into the same anchor list."""
    resp = _make_response([_recommend_intent(attribute="veg")])
    graph = _make_graph(anchors=[
        AnchorEntry("avocado_toast", "Avocado Toast", "chef_pick", 1),
        AnchorEntry("egg_bagel", "Egg Bagel", "chef_pick", 2),
        AnchorEntry("nashville_chicken_burger", "Nashville Chicken", "bestseller", 3),
    ])
    orch, _ = _build_orchestrator([resp], menu_graph=graph)
    result = orch.process_turn("give me vegetarian options")

    rr = result.resolver_results[0]
    assert isinstance(rr.result, ChooseFromCategory)
    option_names = {o.item_name for o in rr.result.options}
    assert option_names == {"Avocado Toast"}
    assert "Egg Bagel" not in option_names
    assert "Nashville Chicken" not in option_names


def test_recommend_veg_filters_cart_pairings():
    """Same constraint applied to the cart-pairings candidate source, not
    just anchors."""
    add_resp = _make_response([{"action": "add_item", "raw_name": "avocado toast", "quantity": 1, "modifiers": [], "special_notes": ""}])
    rec_resp = _make_response([_recommend_intent(attribute="veg")])
    graph = _make_graph(pairings={"avocado_toast": ["egg_bagel", "veggie_bagel"]})
    orch, _ = _build_orchestrator([add_resp, rec_resp], menu_graph=graph)

    orch.process_turn("avocado toast")
    result = orch.process_turn("suggest something vegetarian to go with it")

    rr = result.resolver_results[0]
    option_names = {o.item_name for o in rr.result.options}
    assert option_names == {"Veggie Bagel"}
    assert "Egg Bagel" not in option_names


def test_recommend_veg_falls_back_to_whole_menu_scan_when_anchors_dont_match():
    """If every anchor is non-veg, a veg-constrained recommend must not
    silently return them (or nothing) — it should scan the full menu for a
    veg option rather than dropping the constraint."""
    resp = _make_response([_recommend_intent(attribute="veg")])
    graph = _make_graph(anchors=[
        AnchorEntry("egg_bagel", "Egg Bagel", "chef_pick", 1),
        AnchorEntry("nashville_chicken_burger", "Nashville Chicken", "bestseller", 2),
    ])
    orch, _ = _build_orchestrator([resp], menu_graph=graph)
    result = orch.process_turn("give me vegetarian options")

    rr = result.resolver_results[0]
    option_names = {o.item_name for o in rr.result.options}
    assert len(option_names) > 0
    assert "Egg Bagel" not in option_names
    assert "Nashville Chicken" not in option_names


def test_recommend_no_attribute_unaffected():
    """A plain recommend (no dietary word) keeps today's behavior — no
    filtering applied, matching the pre-existing anchor-fallback tests."""
    resp = _make_response([_recommend_intent()])
    graph = _make_graph(anchors=[
        AnchorEntry("egg_bagel", "Egg Bagel", "chef_pick", 1),
    ])
    orch, _ = _build_orchestrator([resp], menu_graph=graph)
    result = orch.process_turn("kuch suggest karo")

    rr = result.resolver_results[0]
    option_names = {o.item_name for o in rr.result.options}
    assert "Egg Bagel" in option_names
