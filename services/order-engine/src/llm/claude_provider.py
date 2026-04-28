"""Claude (Anthropic) LLM provider implementation — two-pass."""

from __future__ import annotations

import logging

import anthropic

from .base import LLMProvider, LLMResponse
from .intent_parser import parse_intents
from .prompts.system_prompt import (
    build_intent_extraction_prompt,
    build_response_prompt,
)

logger = logging.getLogger(__name__)


class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-haiku-4-5-20251001"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def extract_intents(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        system_prompt = build_intent_extraction_prompt(
            menu_context, resolver_feedback, order_state
        )
        messages = [*conversation_history, {"role": "user", "content": transcript}]

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
            )
        except anthropic.RateLimitError as e:
            logger.error("Rate limited by Anthropic API (pass 1): %s", e)
            return _error_response(self.model, str(e), "Sorry, the system is busy. Please try again in a moment.")
        except anthropic.APIError as e:
            logger.error("Anthropic API error (pass 1): %s", e)
            return _error_response(self.model, str(e), "Sorry, something went wrong. Please try again.")

        raw_output = response.content[0].text
        intents, _discarded_response_text, detected_language = parse_intents(raw_output)

        return LLMResponse(
            intents=intents,
            response_text="",
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="claude",
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
        )

    def generate_response(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        extracted_intents: list[dict],
        turn_outcomes: list[dict],
        current_order: dict | None,
        detected_language: str,
    ) -> LLMResponse:
        system_prompt = build_response_prompt(
            menu_context=menu_context,
            transcript=transcript,
            extracted_intents=extracted_intents,
            turn_outcomes=turn_outcomes,
            current_order=current_order,
            detected_language=detected_language,
        )
        # Pass 2 doesn't need the full prior chat — the system prompt already
        # contains the transcript and turn outcomes. A single neutral user
        # trigger message is enough.
        messages = [{"role": "user", "content": "Generate the customer reply."}]

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=512,
                system=system_prompt,
                messages=messages,
            )
        except anthropic.RateLimitError as e:
            logger.error("Rate limited by Anthropic API (pass 2): %s", e)
            return _error_response(self.model, str(e), "Sorry, the system is busy. Please try again in a moment.")
        except anthropic.APIError as e:
            logger.error("Anthropic API error (pass 2): %s", e)
            return _error_response(self.model, str(e), "Sorry, something went wrong. Please try again.")

        raw_output = response.content[0].text
        response_text = raw_output.strip()

        return LLMResponse(
            intents=[],
            response_text=response_text,
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="claude",
            prompt_tokens=response.usage.input_tokens,
            completion_tokens=response.usage.output_tokens,
        )

    def get_provider_name(self) -> str:
        return "claude"


def _error_response(model: str, raw: str, text: str) -> LLMResponse:
    return LLMResponse(
        intents=[],
        response_text=text,
        detected_language="en",
        raw_output=raw,
        model=model,
        provider="claude",
        prompt_tokens=0,
        completion_tokens=0,
    )
