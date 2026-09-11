"""Unit test for _serialize_resolver_results (backend/routers/voice.py).

Covers the fix for a silent bug: ChooseFromCategory results (recommend and
ask_menu suggestions) had no branch in the serializer at all, so the client
never received them — recommendation/answer cards never rendered even when
the orchestrator resolved a real item.
"""

from __future__ import annotations

from backend.routers.voice import _serialize_resolver_results
from src.models import ChooseFromCategory, ConfidentMatch
from src.orchestrator import ResolverCall


def _match(item_name: str) -> ConfidentMatch:
    return ConfidentMatch(
        item_id=item_name.lower().replace(" ", "_"),
        item_name=item_name,
        price=200,
        category="Hot Coffee",
        score=95.0,
        match_method="exact",
    )


def test_choose_from_category_serializes_each_option_as_unapplied_match():
    call = ResolverCall(
        intent={"action": "recommend", "raw_name": ""},
        raw_name="",
        result=ChooseFromCategory(
            category="recommendations",
            options=[_match("Cappuccino"), _match("Cortado")],
            score=100.0,
            match_method="recommend_anchor",
        ),
        applied_to_order=False,
        feedback_generated=None,
    )

    out = _serialize_resolver_results([call])

    assert len(out) == 2
    assert {o["item"] for o in out} == {"Cappuccino", "Cortado"}
    assert all(o["type"] == "match" for o in out)
    assert all(o["applied"] is False for o in out)


def test_confident_match_still_serializes_as_before():
    call = ResolverCall(
        intent={"action": "add_item", "raw_name": "cappuccino"},
        raw_name="cappuccino",
        result=_match("Cappuccino"),
        applied_to_order=True,
        feedback_generated=None,
    )

    out = _serialize_resolver_results([call])

    assert out == [{
        "raw": "cappuccino",
        "type": "match",
        "item": "Cappuccino",
        "method": "exact",
        "score": 95.0,
        "applied": True,
    }]
