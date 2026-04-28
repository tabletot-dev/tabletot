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

from dataclasses import dataclass
from datetime import datetime

from src.llm.base import LLMProvider, LLMResponse
from src.llm.prompts.menu_summary import generate_menu_summary
from src.loader import MenuIndex
from src.models import (
    Ambiguous,
    ConfidentMatch,
    NeedsVariantSelection,
    NoMatch,
    ResolveResult,
    Unavailable,
)
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
    ) -> None:
        self.provider = provider
        self.menu_index = menu_index
        self.menu_context = generate_menu_summary(menu_data)
        self.order_state = OrderState()
        self.conversation_history: list[dict] = []
        self.pending_feedback: list[dict] | None = None
        self.turn_count: int = 0

    def process_turn(
        self, user_input: str, current_time: datetime | None = None
    ) -> TurnResult:
        """Process one conversation turn through LLM(pass 1) → Resolver → LLM(pass 2)."""
        self.turn_count += 1

        # --- Pass 1: intent extraction ---
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

        # --- Resolver: process each intent, collect turn outcomes ---
        resolver_results: list[ResolverCall] = []
        new_feedback: list[dict] = []
        turn_outcomes: list[dict] = []

        for intent in pass1.intents:
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

            elif action == "ask_menu":
                turn_outcomes.append(
                    {"status": "menu_question", "raw_name": intent.get("raw_name", "")}
                )

            elif action in ("none", "accept_upsell", "reject_upsell"):
                turn_outcomes.append({"status": "none", "raw_name": ""})

        # Store feedback that carries into next turn's pass 1 context
        self.pending_feedback = new_feedback if new_feedback else None

        # --- Pass 2: generate reply grounded in real outcomes ---
        current_order_summary = (
            self.order_state.to_summary_dict()
            if not self.order_state.is_empty()
            else None
        )
        pass2 = self.provider.generate_response(
            transcript=user_input,
            menu_context=self.menu_context,
            conversation_history=self.conversation_history,
            extracted_intents=pass1.intents,
            turn_outcomes=turn_outcomes,
            current_order=current_order_summary,
            detected_language=pass1.detected_language or "en",
        )

        # --- Merge both passes into a single LLMResponse for the TurnResult ---
        merged = LLMResponse(
            intents=pass1.intents,
            response_text=pass2.response_text,
            detected_language=pass1.detected_language or pass2.detected_language,
            raw_output=_merge_raw(pass1.raw_output, pass2.raw_output),
            model=pass1.model or pass2.model,
            provider=pass1.provider or pass2.provider,
            prompt_tokens=pass1.prompt_tokens + pass2.prompt_tokens,
            completion_tokens=pass1.completion_tokens + pass2.completion_tokens,
        )

        # --- Update conversation history with the REAL response ---
        self.conversation_history.append({"role": "user", "content": user_input})
        self.conversation_history.append(
            {"role": "assistant", "content": merged.response_text}
        )
        max_entries = MAX_CONVERSATION_HISTORY * 2
        if len(self.conversation_history) > max_entries:
            self.conversation_history = self.conversation_history[-max_entries:]

        return TurnResult(
            user_input=user_input,
            llm_response=merged,
            resolver_results=resolver_results,
            order_state_snapshot=self.order_state.to_display_dict(),
            pending_feedback=self.pending_feedback,
            turn_number=self.turn_count,
        )

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


def _candidate_name(c: ConfidentMatch | NeedsVariantSelection) -> dict:
    if isinstance(c, ConfidentMatch):
        return {"name": c.item_name}
    if isinstance(c, NeedsVariantSelection):
        return {"name": c.group_name}
    return {"name": "?"}


def _merge_raw(pass1_raw: str, pass2_raw: str) -> str:
    return f"{pass1_raw}\n---PASS2---\n{pass2_raw}"
