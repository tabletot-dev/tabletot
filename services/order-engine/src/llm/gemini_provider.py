"""Google Gemini LLM provider stub — not yet implemented."""

from __future__ import annotations

from .base import LLMProvider, LLMResponse


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model

    def extract_intents(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        raise NotImplementedError(
            "Gemini provider not yet implemented. "
            "Implement using the same two-pass contract as ClaudeProvider."
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
        raise NotImplementedError(
            "Gemini provider not yet implemented. "
            "Implement using the same two-pass contract as ClaudeProvider."
        )

    def get_provider_name(self) -> str:
        return "gemini"
