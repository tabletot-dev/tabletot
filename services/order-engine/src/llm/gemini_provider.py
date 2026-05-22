"""Google Gemini LLM provider — two-pass, with streaming Pass 2.

Uses the `google-genai` SDK (not the deprecated `google-generativeai`).
Install: pip install google-genai
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

from google import genai
from google.genai import types

from ._sentence_splitter import drain_buffer, split_buffer
from .base import LLMProvider, LLMResponse
from .intent_parser import parse_intents
from .prompts.system_prompt import build_intent_extraction_prompt, build_response_prompt

logger = logging.getLogger(__name__)


def _to_gemini_contents(history: list[dict], current_message: str) -> list[dict]:
    """Convert OpenAI-style history + current message to Gemini contents format.

    OpenAI/Claude: {"role": "user"|"assistant", "content": "..."}
    Gemini:        {"role": "user"|"model",      "parts": [{"text": "..."}]}
    """
    contents = []
    for msg in history:
        role = "model" if msg["role"] == "assistant" else msg["role"]
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})
    contents.append({"role": "user", "parts": [{"text": current_message}]})
    return contents


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def extract_intents(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        system_prompt = build_intent_extraction_prompt(menu_context, resolver_feedback, order_state)
        contents = _to_gemini_contents(conversation_history, transcript)

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=1024,
                ),
            )
        except Exception as e:
            logger.error("Gemini API error (pass 1): %s", e)
            return _error_response(self.model, str(e))

        raw_output = response.text or ""
        intents, _, detected_language = parse_intents(raw_output)
        usage = response.usage_metadata

        return LLMResponse(
            intents=intents,
            response_text="",
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="gemini",
            prompt_tokens=usage.prompt_token_count if usage else 0,
            completion_tokens=usage.candidates_token_count if usage else 0,
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
        voice_persona: str | None = None,
    ) -> LLMResponse:
        system_prompt = build_response_prompt(
            menu_context=menu_context,
            transcript=transcript,
            extracted_intents=extracted_intents,
            turn_outcomes=turn_outcomes,
            current_order=current_order,
            detected_language=detected_language,
            voice_persona=voice_persona,
        )
        # Pass 2 needs no conversation history — system prompt has full context
        contents = [{"role": "user", "parts": [{"text": "Generate the customer reply."}]}]

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=512,
                ),
            )
        except Exception as e:
            logger.error("Gemini API error (pass 2): %s", e)
            return _error_response(self.model, str(e), "Sorry, something went wrong. Please try again.")

        raw_output = response.text or ""
        usage = response.usage_metadata

        return LLMResponse(
            intents=[],
            response_text=raw_output.strip(),
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="gemini",
            prompt_tokens=usage.prompt_token_count if usage else 0,
            completion_tokens=usage.candidates_token_count if usage else 0,
        )

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
        system_prompt = build_response_prompt(
            menu_context=menu_context,
            transcript=transcript,
            extracted_intents=extracted_intents,
            turn_outcomes=turn_outcomes,
            current_order=current_order,
            detected_language=detected_language,
            voice_persona=voice_persona,
        )
        contents = [{"role": "user", "parts": [{"text": "Generate the customer reply."}]}]

        try:
            buffer = ""
            async for chunk in await self.client.aio.models.generate_content_stream(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=512,
                ),
            ):
                token = chunk.text or ""
                if token:
                    buffer += token
                    sentences, buffer = split_buffer(buffer)
                    for sentence in sentences:
                        yield sentence
            for sentence in drain_buffer(buffer):
                yield sentence
        except Exception as e:
            logger.error("Gemini API error (pass 2 stream): %s", e)
            yield "Sorry, something went wrong. Please try again."

    def get_provider_name(self) -> str:
        return "gemini"


def _error_response(model: str, raw: str, text: str = "") -> LLMResponse:
    return LLMResponse(
        intents=[],
        response_text=text,
        detected_language="en",
        raw_output=raw,
        model=model,
        provider="gemini",
        prompt_tokens=0,
        completion_tokens=0,
    )
