"""Tests for intent parser — canned LLM outputs, no API calls."""

from src.llm.intent_parser import parse_intents


VALID_SINGLE = """
<intents>
[{"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""}]
</intents>
<response>Butter chicken, done! Kuch aur chahiye?</response>
<language>hi</language>
"""

VALID_MULTI = """
<intents>
[
  {"action": "add_item", "raw_name": "butter chicken", "quantity": 1, "modifiers": [], "special_notes": ""},
  {"action": "add_item", "raw_name": "garlic naan", "quantity": 2, "modifiers": [], "special_notes": "extra butter"}
]
</intents>
<response>Butter chicken aur do garlic naan, extra butter ke saath. Kuch aur chahiye?</response>
<language>hi</language>
"""

CONFIRM_ORDER = """
<intents>
[{"action": "confirm_order", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}]
</intents>
<response>Perfect, aapka order confirm karta hoon!</response>
<language>hi</language>
"""

NONE_ACTION = """
<intents>
[{"action": "none", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}]
</intents>
<response>Hello! Silver mein aapka swagat hai.</response>
<language>hi</language>
"""


def test_valid_single_intent():
    intents, response, lang = parse_intents(VALID_SINGLE)
    assert len(intents) == 1
    assert intents[0]["action"] == "add_item"
    assert intents[0]["raw_name"] == "butter chicken"
    assert intents[0]["quantity"] == 1
    assert response == "Butter chicken, done! Kuch aur chahiye?"
    assert lang == "hi"


def test_valid_multi_intents():
    intents, response, lang = parse_intents(VALID_MULTI)
    assert len(intents) == 2
    assert intents[0]["raw_name"] == "butter chicken"
    assert intents[1]["raw_name"] == "garlic naan"
    assert intents[1]["quantity"] == 2
    assert intents[1]["special_notes"] == "extra butter"


def test_confirm_order():
    intents, response, lang = parse_intents(CONFIRM_ORDER)
    assert len(intents) == 1
    assert intents[0]["action"] == "confirm_order"
    assert intents[0]["quantity"] == 1  # normalized from 0


def test_none_action():
    intents, response, lang = parse_intents(NONE_ACTION)
    assert len(intents) == 1
    assert intents[0]["action"] == "none"


def test_missing_intents_tag():
    raw = "Some random LLM output without tags"
    intents, response, lang = parse_intents(raw)
    assert intents == []
    assert response == raw.strip()
    assert lang == "en"


def test_malformed_json():
    raw = "<intents>not valid json</intents><response>oops</response>"
    intents, response, lang = parse_intents(raw)
    assert intents == []
    assert response == "oops"


def test_invalid_action_dropped():
    raw = """
<intents>
[{"action": "fly_to_moon", "raw_name": "rocket", "quantity": 1}]
</intents>
<response>Cannot fly</response>
<language>en</language>
"""
    intents, response, lang = parse_intents(raw)
    assert intents == []


def test_add_item_without_name_dropped():
    raw = """
<intents>
[{"action": "add_item", "raw_name": "", "quantity": 1}]
</intents>
<response>What item?</response>
<language>en</language>
"""
    intents, response, lang = parse_intents(raw)
    assert intents == []


def test_quantity_normalization():
    raw = """
<intents>
[{"action": "add_item", "raw_name": "chai", "quantity": -1}]
</intents>
<response>chai</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert intents[0]["quantity"] == 1  # clamped to 1


def test_quantity_non_numeric():
    raw = """
<intents>
[{"action": "add_item", "raw_name": "chai", "quantity": "ek"}]
</intents>
<response>chai</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert intents[0]["quantity"] == 1  # default


def test_missing_response_tag():
    raw = """
<intents>
[{"action": "none", "raw_name": "", "quantity": 0}]
</intents>
"""
    intents, response, lang = parse_intents(raw)
    assert len(intents) == 1
    assert response == raw.strip()  # fallback to full output
    assert lang == "en"


def test_mixed_valid_and_invalid():
    raw = """
<intents>
[
  {"action": "add_item", "raw_name": "naan", "quantity": 2},
  {"action": "teleport", "raw_name": "moon"},
  {"action": "add_item", "raw_name": "chai", "quantity": 1}
]
</intents>
<response>naan aur chai</response>
<language>hi</language>
"""
    intents, _, _ = parse_intents(raw)
    assert len(intents) == 2
    assert intents[0]["raw_name"] == "naan"
    assert intents[1]["raw_name"] == "chai"


def test_single_dict_instead_of_list():
    raw = """
<intents>
{"action": "add_item", "raw_name": "coffee", "quantity": 1}
</intents>
<response>coffee</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert len(intents) == 1
    assert intents[0]["raw_name"] == "coffee"


def test_modifiers_normalized():
    raw = """
<intents>
[{"action": "add_item", "raw_name": "houseblend", "quantity": 1, "modifiers": ["pour over"], "special_notes": ""}]
</intents>
<response>done</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert intents[0]["modifiers"] == ["pour over"]


def test_modifiers_non_list_normalized():
    raw = """
<intents>
[{"action": "add_item", "raw_name": "houseblend", "quantity": 1, "modifiers": "pour over"}]
</intents>
<response>done</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert intents[0]["modifiers"] == []  # non-list is normalized to empty


def test_filter_preserves_attribute_and_category():
    """Regression: _validate_intent used to return a fixed 5-key dict that
    silently dropped attribute/category, so every filter intent reached the
    orchestrator with attribute="" — _handle_filter then matched every menu
    item instead of just vegetarian ones (client-reported bug)."""
    raw = """
<intents>
[{"action": "filter", "attribute": "veg", "category": "Pastas", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}]
</intents>
<response>Here are our veg pastas.</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert intents[0]["attribute"] == "veg"
    assert intents[0]["category"] == "Pastas"


def test_filter_attribute_defaults_to_empty_string():
    raw = """
<intents>
[{"action": "filter", "raw_name": "", "quantity": 0, "modifiers": [], "special_notes": ""}]
</intents>
<response>ok</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert intents[0]["attribute"] == ""
    assert intents[0]["category"] == ""


def test_recommend_preserves_attribute_but_not_category():
    raw = """
<intents>
[{"action": "recommend", "raw_name": "", "attribute": "veg", "category": "Pastas", "quantity": 0, "modifiers": [], "special_notes": ""}]
</intents>
<response>ok</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert intents[0]["attribute"] == "veg"
    assert "category" not in intents[0]  # recommend has no category concept


def test_other_actions_have_no_attribute_or_category_keys():
    raw = """
<intents>
[{"action": "add_item", "raw_name": "cappuccino", "quantity": 1, "modifiers": [], "special_notes": "", "attribute": "veg", "category": "Hot Coffee"}]
</intents>
<response>ok</response>
<language>en</language>
"""
    intents, _, _ = parse_intents(raw)
    assert "attribute" not in intents[0]
    assert "category" not in intents[0]
