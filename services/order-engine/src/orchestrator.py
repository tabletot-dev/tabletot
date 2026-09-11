"""Orchestrator — wires LLM → Resolver → Order State.

Two-pass LLM flow (see docs/ORCHESTRATOR.md):
    1. Pass 1: extract_intents(transcript, …) — structured intents only
    2. Resolver runs on each intent, mutating order state
    3. Pass 2: generate_response(transcript, intents, turn_outcomes, order) —
       the customer-facing reply, written with full knowledge of what the
       resolver actually did. This guarantees the reply never confirms items
       that failed to resolve.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncIterator

from src.llm.base import LLMProvider, LLMResponse
from src.llm.prompts.menu_summary import generate_menu_summary
from src.loader import MenuIndex
from src.menu_graph import MenuGraph
from src.models import (
    Ambiguous,
    ChooseFromCategory,
    ConfidentMatch,
    NeedsVariantSelection,
    NoMatch,
    ResolveResult,
    Unavailable,
)
from src.normalizer import normalize
from src.order_state import OrderState
from src.resolver import resolve

MAX_CONVERSATION_HISTORY = 10


@dataclass
class ResolverCall:
    """Record of one resolver call within a turn."""

    intent: dict
    raw_name: str
    result: ResolveResult
    applied_to_order: bool
    feedback_generated: dict | None


@dataclass
class _ResolveContext:
    """Internal: result of Pass 1 + resolver, before Pass 2 runs."""
    pass1: LLMResponse
    resolver_results: list[ResolverCall]
    turn_outcomes: list[dict]
    new_feedback: list[dict]


@dataclass
class TurnResult:
    """Complete result of one conversation turn."""

    user_input: str
    llm_response: LLMResponse
    resolver_results: list[ResolverCall]
    order_state_snapshot: dict
    pending_feedback: list[dict] | None
    turn_number: int


class Orchestrator:
    def __init__(
        self,
        provider: LLMProvider,
        menu_index: MenuIndex,
        menu_data: dict,
        voice_persona: str | None = None,
        menu_graph: MenuGraph | None = None,
    ) -> None:
        self.provider = provider
        self.menu_index = menu_index
        self.menu_context = generate_menu_summary(menu_data)
        self.voice_persona = voice_persona
        self.menu_graph = menu_graph
        self.order_state = OrderState()
        self.conversation_history: list[dict] = []
        self.pending_feedback: list[dict] | None = None
        self.turn_count: int = 0

    def _apply_intents(
        self,
        intents: list[dict],
        current_time: datetime | None,
    ) -> tuple[list[ResolverCall], list[dict], list[dict]]:
        """Run the resolver loop over extracted intents and mutate order state.

        CPU-bound (rapidfuzz). Safe to call in a thread via asyncio.to_thread.
        """
        resolver_results: list[ResolverCall] = []
        new_feedback: list[dict] = []
        turn_outcomes: list[dict] = []

        for intent in intents:
            action = intent.get("action")
            if action == "add_item":
                self._handle_add(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action == "remove_item":
                self._handle_remove(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action == "modify_item":
                self._handle_modify(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action == "select_variant":
                self._handle_add(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action == "confirm_order":
                if self.order_state.is_empty():
                    new_feedback.append({"type": "empty_order"})
                    turn_outcomes.append({"status": "empty_order", "raw_name": ""})
                else:
                    self.order_state.confirm()
                    turn_outcomes.append({"status": "confirmed", "raw_name": ""})
            elif action == "browse_category":
                self._handle_browse(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action == "filter":
                self._handle_filter(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action == "recommend":
                self._handle_recommend(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action == "ask_menu":
                self._handle_ask_menu(intent, current_time, resolver_results, new_feedback, turn_outcomes)
            elif action in ("none", "accept_upsell", "reject_upsell"):
                turn_outcomes.append({"status": "none", "raw_name": ""})

        return resolver_results, new_feedback, turn_outcomes

    def _resolve(self, user_input: str, current_time: datetime | None) -> _ResolveContext:
        """Pass 1 + resolver (sync). Used by process_turn (CLI / unit tests).

        Does NOT call Pass 2 — caller decides whether to stream or batch the response.
        Must be called with self.turn_count already incremented.
        """
        pass1 = self.provider.extract_intents(
            transcript=user_input,
            menu_context=self.menu_context,
            conversation_history=self.conversation_history,
            resolver_feedback=self.pending_feedback,
            order_state=(
                self.order_state.to_summary_dict()
                if not self.order_state.is_empty()
                else None
            ),
        )
        if pass1.detected_language:
            self.order_state.language = pass1.detected_language

        resolver_results, new_feedback, turn_outcomes = self._apply_intents(
            pass1.intents, current_time
        )
        self.pending_feedback = new_feedback if new_feedback else None
        return _ResolveContext(
            pass1=pass1,
            resolver_results=resolver_results,
            turn_outcomes=turn_outcomes,
            new_feedback=new_feedback,
        )

    async def _resolve_async(self, user_input: str, current_time: datetime | None) -> _ResolveContext:
        """Pass 1 + resolver (async). Used by process_turn_streaming (voice path).

        LLM call runs in the event loop via the provider's async client.
        Resolver (rapidfuzz) runs in a thread — CPU-bound.
        Must be called with self.turn_count already incremented.
        """
        pass1 = await self.provider.extract_intents_async(
            transcript=user_input,
            menu_context=self.menu_context,
            conversation_history=self.conversation_history,
            resolver_feedback=self.pending_feedback,
            order_state=(
                self.order_state.to_summary_dict()
                if not self.order_state.is_empty()
                else None
            ),
        )
        if pass1.detected_language:
            self.order_state.language = pass1.detected_language

        resolver_results, new_feedback, turn_outcomes = await asyncio.to_thread(
            self._apply_intents, pass1.intents, current_time
        )
        self.pending_feedback = new_feedback if new_feedback else None
        return _ResolveContext(
            pass1=pass1,
            resolver_results=resolver_results,
            turn_outcomes=turn_outcomes,
            new_feedback=new_feedback,
        )

    def _build_turn_result(
        self, user_input: str, ctx: _ResolveContext, response_text: str
    ) -> TurnResult:
        """Merge pass1 + pass2 response_text into a TurnResult and update history."""
        merged = LLMResponse(
            intents=ctx.pass1.intents,
            response_text=response_text,
            detected_language=ctx.pass1.detected_language or "en",
            raw_output=ctx.pass1.raw_output,
            model=ctx.pass1.model,
            provider=ctx.pass1.provider,
            prompt_tokens=ctx.pass1.prompt_tokens,
            completion_tokens=0,
        )
        self.conversation_history.append({"role": "user", "content": user_input})
        self.conversation_history.append({"role": "assistant", "content": response_text})
        max_entries = MAX_CONVERSATION_HISTORY * 2
        if len(self.conversation_history) > max_entries:
            self.conversation_history = self.conversation_history[-max_entries:]
        return TurnResult(
            user_input=user_input,
            llm_response=merged,
            resolver_results=ctx.resolver_results,
            order_state_snapshot=self.order_state.to_display_dict(),
            pending_feedback=self.pending_feedback,
            turn_number=self.turn_count,
        )

    def process_turn(
        self, user_input: str, current_time: datetime | None = None
    ) -> TurnResult:
        """Process one conversation turn through LLM(pass 1) → Resolver → LLM(pass 2).

        Blocking/synchronous — used by the CLI and unit tests.
        For the voice WebSocket path use process_turn_streaming() instead.
        """
        self.turn_count += 1
        ctx = self._resolve(user_input, current_time)

        current_order_summary = (
            self.order_state.to_summary_dict() if not self.order_state.is_empty() else None
        )
        pass2 = self.provider.generate_response(
            transcript=user_input,
            menu_context=self.menu_context,
            conversation_history=self.conversation_history,
            extracted_intents=ctx.pass1.intents,
            turn_outcomes=ctx.turn_outcomes,
            current_order=current_order_summary,
            detected_language=ctx.pass1.detected_language or "en",
            voice_persona=self.voice_persona,
        )
        return self._build_turn_result(user_input, ctx, pass2.response_text)

    async def process_turn_streaming(
        self, user_input: str, current_time: datetime | None = None
    ) -> AsyncIterator[str | TurnResult]:
        """Streaming variant: yields sentence strings from Pass 2 as they arrive,
        then yields a final TurnResult.

        Pass 1 + resolver run in a thread (they are sync) so the event loop stays free.
        Pass 2 streams directly in the event loop via AsyncAnthropic.

        Usage (in voice.py):
            async for item in orchestrator.process_turn_streaming(transcript):
                if isinstance(item, str):
                    await tts_queue.put(item)   # sentence → TTS immediately
                else:
                    result = item               # TurnResult, yielded last
        """
        self.turn_count += 1
        ctx = await self._resolve_async(user_input, current_time)

        current_order_summary = (
            self.order_state.to_summary_dict() if not self.order_state.is_empty() else None
        )

        sentences: list[str] = []
        async for sentence in self.provider.generate_response_stream(
            transcript=user_input,
            menu_context=self.menu_context,
            conversation_history=self.conversation_history,
            extracted_intents=ctx.pass1.intents,
            turn_outcomes=ctx.turn_outcomes,
            current_order=current_order_summary,
            detected_language=ctx.pass1.detected_language or "en",
            voice_persona=self.voice_persona,
        ):
            sentences.append(sentence)
            yield sentence

        full_response = " ".join(sentences)
        yield self._build_turn_result(user_input, ctx, full_response)

    def reset(self) -> None:
        """Reset conversation state for a new order."""
        self.order_state.clear()
        self.conversation_history = []
        self.pending_feedback = None
        self.turn_count = 0

    # ---- Intent handlers ----

    def _handle_add(
        self,
        intent: dict,
        current_time: datetime | None,
        resolver_results: list[ResolverCall],
        new_feedback: list[dict],
        turn_outcomes: list[dict],
    ) -> None:
        raw_name = intent["raw_name"]
        result = resolve(raw_name, self.menu_index, current_time)

        if isinstance(result, ConfidentMatch):
            qty = intent.get("quantity", 1)
            notes = intent.get("special_notes", "")
            self.order_state.add_item(
                item_id=result.item_id,
                item_name=result.item_name,
                quantity=qty,
                unit_price=result.price,
                special_notes=notes,
                modifiers=intent.get("modifiers", []),
                category=result.category,
            )
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=True, feedback_generated=None)
            )
            turn_outcomes.append({
                "status": "added",
                "raw_name": raw_name,
                "item_name": result.item_name,
                "quantity": qty,
                "special_notes": notes,
            })

        elif isinstance(result, NeedsVariantSelection):
            feedback = {
                "type": "needs_variant",
                "input": raw_name,
                "item": result.group_name,
                "variants": [{"name": v.name, "parent": v.parent_name} for v in result.variants],
            }
            new_feedback.append(feedback)
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=False, feedback_generated=feedback)
            )
            turn_outcomes.append({
                "status": "needs_variant",
                "raw_name": raw_name,
                "item_name": result.group_name,
                "variants": [v.name for v in result.variants],
            })

        elif isinstance(result, Ambiguous):
            feedback = {
                "type": "ambiguous",
                "input": raw_name,
                "candidates": [_candidate_name(c) for c in result.candidates],
            }
            new_feedback.append(feedback)
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=False, feedback_generated=feedback)
            )
            turn_outcomes.append({
                "status": "ambiguous",
                "raw_name": raw_name,
                "candidates": [c["name"] for c in feedback["candidates"]],
            })

        elif isinstance(result, NoMatch):
            suggestions = [name for name, score in result.suggestions]
            feedback = {
                "type": "no_match",
                "input": raw_name,
                "suggestions": suggestions,
            }
            new_feedback.append(feedback)
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=False, feedback_generated=feedback)
            )
            turn_outcomes.append({
                "status": "no_match",
                "raw_name": raw_name,
                "suggestions": suggestions,
            })

        elif isinstance(result, Unavailable):
            feedback = {
                "type": "unavailable",
                "input": raw_name,
                "item": result.item_name,
                "reason": result.reason,
            }
            new_feedback.append(feedback)
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=False, feedback_generated=feedback)
            )
            turn_outcomes.append({
                "status": "unavailable",
                "raw_name": raw_name,
                "item_name": result.item_name,
                "reason": result.reason,
            })

    def _handle_remove(
        self,
        intent: dict,
        current_time: datetime | None,
        resolver_results: list[ResolverCall],
        new_feedback: list[dict],
        turn_outcomes: list[dict],
    ) -> None:
        raw_name = intent["raw_name"]
        result = resolve(raw_name, self.menu_index, current_time)

        if isinstance(result, ConfidentMatch):
            removed = self.order_state.remove_item(result.item_id)
            if not removed:
                new_feedback.append({"type": "not_in_order", "item": result.item_name})
                turn_outcomes.append({
                    "status": "not_in_order",
                    "raw_name": raw_name,
                    "item_name": result.item_name,
                })
            else:
                turn_outcomes.append({
                    "status": "removed",
                    "raw_name": raw_name,
                    "item_name": result.item_name,
                })
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=removed, feedback_generated=None)
            )
        else:
            # Resolver couldn't identify the item — generate same feedback as an add attempt.
            self._handle_add(intent, current_time, resolver_results, new_feedback, turn_outcomes)

    def _handle_modify(
        self,
        intent: dict,
        current_time: datetime | None,
        resolver_results: list[ResolverCall],
        new_feedback: list[dict],
        turn_outcomes: list[dict],
    ) -> None:
        raw_name = intent["raw_name"]
        result = resolve(raw_name, self.menu_index, current_time)

        if isinstance(result, ConfidentMatch):
            qty = intent.get("quantity", 1)
            if qty > 0:
                self.order_state.modify_quantity(result.item_id, qty)
            notes = intent.get("special_notes", "")
            if notes:
                self.order_state.update_notes(result.item_id, notes)
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=True, feedback_generated=None)
            )
            turn_outcomes.append({
                "status": "modified",
                "raw_name": raw_name,
                "item_name": result.item_name,
                "quantity": qty,
                "special_notes": notes,
            })
        else:
            self._handle_add(intent, current_time, resolver_results, new_feedback, turn_outcomes)

    def _handle_filter(
        self,
        intent: dict,
        current_time: datetime | None,
        resolver_results: list[ResolverCall],
        new_feedback: list[dict],
        turn_outcomes: list[dict],
    ) -> None:
        attribute = intent.get("attribute", "").strip().lower()
        category_hint = intent.get("category", "").strip()

        # Map attribute to is_veg flag
        is_veg: bool | None = None
        if attribute in ("veg", "vegetarian"):
            is_veg = True
        elif attribute.startswith("non"):
            is_veg = False

        # Optional category narrowing
        cat_name: str | None = None
        if category_hint:
            found = _find_category(category_hint, self.menu_index)
            if found:
                cat_name = found[0]

        # Build filtered item list
        options: list[ConfidentMatch] = [
            ConfidentMatch(
                item_id=item.id,
                item_name=item.name,
                price=item.price or 0,
                category=item.category,
                score=100.0,
                match_method="filter",
                requires_modifier=item.modifiers if item.modifiers else None,
            )
            for item in self.menu_index.items_by_id.values()
            if (is_veg is None or ("veg" in item.tags) == is_veg)
            and (cat_name is None or item.category == cat_name)
        ]

        if not options:
            turn_outcomes.append({"status": "no_match", "raw_name": attribute, "suggestions": []})
            return

        label = attribute or "matching"
        if cat_name:
            label = f"{attribute} in {cat_name}" if attribute else cat_name

        result = ChooseFromCategory(
            category=label,
            options=options,
            score=100.0,
            match_method="filter",
        )
        resolver_results.append(
            ResolverCall(intent, attribute, result, applied_to_order=False, feedback_generated=None)
        )
        turn_outcomes.append({
            "status": "choose_from_category",
            "category": label,
            "options": [o.item_name for o in options],
        })

    def _handle_browse(
        self,
        intent: dict,
        current_time: datetime | None,
        resolver_results: list[ResolverCall],
        new_feedback: list[dict],
        turn_outcomes: list[dict],
    ) -> None:
        raw_name = intent.get("raw_name", "")
        found = _find_category(raw_name, self.menu_index)

        if found is not None:
            cat_name, options = found
            result = ChooseFromCategory(
                category=cat_name,
                options=options,
                score=100.0,
                match_method="browse",
            )
            resolver_results.append(
                ResolverCall(intent, raw_name, result, applied_to_order=False, feedback_generated=None)
            )
            turn_outcomes.append({
                "status": "choose_from_category",
                "category": cat_name,
                "options": [o.item_name for o in options],
            })
        else:
            # No matching category found — treat as a general menu question.
            turn_outcomes.append({"status": "menu_question", "raw_name": raw_name})

    def _handle_ask_menu(
        self,
        intent: dict,
        current_time: datetime | None,
        resolver_results: list[ResolverCall],
        new_feedback: list[dict],
        turn_outcomes: list[dict],
    ) -> None:
        """Informational questions ("what's in the aglio e olio?", "is X spicy?").

        Never mutates order state — this is a question, not an add. When the
        question names a real menu item, resolve it so the client can show a
        suggestion card alongside Pass 2's text answer (previously this action
        produced no resolver_results at all, so the client had nothing to
        render even when the LLM's reply named a specific dish).
        """
        raw_name = intent.get("raw_name", "").strip()
        if raw_name:
            result = resolve(raw_name, self.menu_index, current_time)
            if isinstance(result, (ConfidentMatch, ChooseFromCategory)):
                resolver_results.append(
                    ResolverCall(intent, raw_name, result, applied_to_order=False, feedback_generated=None)
                )
        turn_outcomes.append({"status": "menu_question", "raw_name": raw_name})


    def _handle_recommend(
        self,
        intent: dict,
        current_time: datetime | None,
        resolver_results: list[ResolverCall],
        new_feedback: list[dict],
        turn_outcomes: list[dict],
    ) -> None:
        raw_name = intent.get("raw_name", "").strip()
        graph = self.menu_graph

        candidates: list[ConfidentMatch] = []

        # 1. Named item: suggest it without adding, or browse its category.
        if raw_name:
            result = resolve(raw_name, self.menu_index, current_time)
            if isinstance(result, ConfidentMatch):
                candidates.append(result)
            elif isinstance(result, ChooseFromCategory):
                candidates = result.options[:3]

        # 2. No specific item: try pairings for items already in the cart.
        if not candidates and graph and not self.order_state.is_empty():
            seen: set[str] = set()
            for order_item in self.order_state.items[:3]:
                for pair_id in graph.pairs_for(order_item.item_id)[:2]:
                    if pair_id in self.menu_index.items_by_id and pair_id not in seen:
                        seen.add(pair_id)
                        item = self.menu_index.items_by_id[pair_id]
                        candidates.append(ConfidentMatch(
                            item_id=item.id,
                            item_name=item.name,
                            price=item.price or 0,
                            category=item.category,
                            score=100.0,
                            match_method="recommend_pairing",
                            requires_modifier=item.modifiers if item.modifiers else None,
                        ))

        # 3. Fall back to anchor items (chef picks, then bestsellers).
        if not candidates and graph:
            seen = set()
            for anchor in graph.top_anchors:
                if anchor.item_id in self.menu_index.items_by_id and anchor.item_id not in seen:
                    seen.add(anchor.item_id)
                    item = self.menu_index.items_by_id[anchor.item_id]
                    candidates.append(ConfidentMatch(
                        item_id=item.id,
                        item_name=item.name,
                        price=item.price or 0,
                        category=item.category,
                        score=100.0,
                        match_method="recommend_anchor",
                        requires_modifier=item.modifiers if item.modifiers else None,
                    ))

        if not candidates:
            # MenuGraph not loaded or anchors empty — graceful degradation.
            turn_outcomes.append({"status": "menu_question", "raw_name": raw_name or "recommendations"})
            return

        result_obj = ChooseFromCategory(
            category="recommendations",
            options=candidates[:3],
            score=100.0,
            match_method="recommend",
        )
        resolver_results.append(
            ResolverCall(intent, raw_name, result_obj, applied_to_order=False, feedback_generated=None)
        )
        turn_outcomes.append({
            "status": "recommend",
            "suggestions": [{"name": c.item_name, "category": c.category} for c in candidates[:3]],
        })


def _candidate_name(c: ConfidentMatch | NeedsVariantSelection) -> dict:
    if isinstance(c, ConfidentMatch):
        return {"name": c.item_name}
    if isinstance(c, NeedsVariantSelection):
        return {"name": c.group_name}
    return {"name": "?"}


def _merge_raw(pass1_raw: str, pass2_raw: str) -> str:
    return f"{pass1_raw}\n---PASS2---\n{pass2_raw}"


def _find_category(
    raw_name: str, index: MenuIndex
) -> tuple[str, list[ConfidentMatch]] | None:
    """Find the best-matching menu category for raw_name.

    Returns (display_category_name, list[ConfidentMatch]) or None.
    Tries exact normalized match first, then fuzzy (token_sort_ratio ≥ 75).
    """
    from rapidfuzz import fuzz
    from rapidfuzz import process as rfprocess

    norm = normalize(raw_name)
    if not norm or not index.categories:
        return None

    # normalized_key → display name
    cat_map: dict[str, str] = {
        normalize(cat.name): cat.name for cat in index.categories.values()
    }

    cat_name: str | None = cat_map.get(norm)

    if cat_name is None:
        result = rfprocess.extractOne(
            norm, list(cat_map.keys()), scorer=fuzz.token_sort_ratio
        )
        if result and result[1] >= 75:
            cat_name = cat_map[result[0]]

    if cat_name is None:
        return None

    options = [
        ConfidentMatch(
            item_id=item.id,
            item_name=item.name,
            price=item.price or 0,
            category=item.category,
            score=100.0,
            match_method="browse",
            requires_modifier=item.modifiers if item.modifiers else None,
        )
        for item in index.items_by_id.values()
        if item.category == cat_name
    ]
    return (cat_name, options)
