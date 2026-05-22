"""Abstract LLM provider interface.

The orchestrator depends only on this interface — never on a specific SDK.

Each turn uses two LLM passes:
    1. extract_intents — parses user speech into structured intents (no user-facing text).
    2. generate_response — writes the natural-language reply AFTER the resolver has run,
       so the reply reflects what actually happened (never confirms items that failed to resolve).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class LLMResponse:
    """Combined result of both LLM passes for a single turn."""

    intents: list[dict]
    response_text: str
    detected_language: str
    raw_output: str
    model: str
    provider: str
    prompt_tokens: int
    completion_tokens: int


class LLMProvider(ABC):
    """Abstract interface for LLM providers."""

    @abstractmethod
    def extract_intents(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        """Pass 1: extract structured intents + detected language from the transcript.

        Populates: intents, detected_language, raw_output, tokens.
        Does NOT populate response_text — that is generated in pass 2 after the
        resolver has run and can be held accountable to real outcomes.
        """
        pass

    @abstractmethod
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
        """Pass 2: generate the customer-facing reply given what actually happened.

        turn_outcomes is a list of per-intent result summaries produced by the
        orchestrator after the resolver runs (one entry per processed intent).
        Each entry has at least a `status` key: "added", "removed", "modified",
        "confirmed", "no_match", "ambiguous", "needs_variant", "unavailable",
        "not_in_order", "empty_order", or "noop".

        Populates: response_text, raw_output, tokens. intents is [].
        """
        pass

    async def generate_response_stream(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        extracted_intents: list[dict],
        turn_outcomes: list[dict],
        current_order: dict | None,
        detected_language: str,
        voice_persona: str | None = None,
    ) -> AsyncIterator[str]:
        """Pass 2, streaming variant: yields sentence-sized chunks as they are generated.

        Default implementation calls generate_response() and yields the full text
        as a single chunk — providers that support streaming override this.
        """
        result = self.generate_response(
            transcript=transcript,
            menu_context=menu_context,
            conversation_history=conversation_history,
            extracted_intents=extracted_intents,
            turn_outcomes=turn_outcomes,
            current_order=current_order,
            detected_language=detected_language,
            voice_persona=voice_persona,
        )
        yield result.response_text

    @abstractmethod
    def get_provider_name(self) -> str:
        pass
