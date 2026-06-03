"""OpenAI LLM provider — two-pass, with streaming Pass 2."""

from __future__ import annotations

import logging
from typing import AsyncIterator

import openai

from ._sentence_splitter import drain_buffer, split_buffer
from .base import LLMProvider, LLMResponse
from .intent_parser import parse_intents
from .prompts.system_prompt import build_intent_extraction_prompt, build_response_prompt

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.client = openai.OpenAI(api_key=api_key)
        self.async_client = openai.AsyncOpenAI(api_key=api_key)
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
        messages = [
            {"role": "system", "content": system_prompt},
            *conversation_history,
            {"role": "user", "content": transcript},
        ]
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=1024,
                messages=messages,
            )
        except openai.RateLimitError as e:
            logger.error("OpenAI rate limited (pass 1): %s", e)
            return _error_response(self.model, str(e))
        except openai.APIError as e:
            logger.error("OpenAI API error (pass 1): %s", e)
            return _error_response(self.model, str(e))

        raw_output = response.choices[0].message.content or ""
        intents, _, detected_language = parse_intents(raw_output)

        return LLMResponse(
            intents=intents,
            response_text="",
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="openai",
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
        )

    async def extract_intents_async(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        system_prompt = build_intent_extraction_prompt(menu_context, resolver_feedback, order_state)
        messages = [
            {"role": "system", "content": system_prompt},
            *conversation_history,
            {"role": "user", "content": transcript},
        ]
        try:
            response = await self.async_client.chat.completions.create(
                model=self.model,
                max_tokens=1024,
                messages=messages,
            )
        except openai.RateLimitError as e:
            logger.error("OpenAI rate limited (pass 1 async): %s", e)
            return _error_response(self.model, str(e))
        except openai.APIError as e:
            logger.error("OpenAI API error (pass 1 async): %s", e)
            return _error_response(self.model, str(e))

        raw_output = response.choices[0].message.content or ""
        intents, _, detected_language = parse_intents(raw_output)
        return LLMResponse(
            intents=intents,
            response_text="",
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="openai",
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
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
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Generate the customer reply."},
        ]
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=512,
                messages=messages,
            )
        except openai.RateLimitError as e:
            logger.error("OpenAI rate limited (pass 2): %s", e)
            return _error_response(self.model, str(e), "Sorry, the system is busy. Please try again.")
        except openai.APIError as e:
            logger.error("OpenAI API error (pass 2): %s", e)
            return _error_response(self.model, str(e), "Sorry, something went wrong. Please try again.")

        raw_output = response.choices[0].message.content or ""
        return LLMResponse(
            intents=[],
            response_text=raw_output.strip(),
            detected_language=detected_language,
            raw_output=raw_output,
            model=self.model,
            provider="openai",
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
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
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Generate the customer reply."},
        ]
        try:
            buffer = ""
            stream = await self.async_client.chat.completions.create(
                model=self.model,
                max_tokens=512,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
            )
            async for chunk in stream:
                token = chunk.choices[0].delta.content if chunk.choices else None
                if token:
                    buffer += token
                    sentences, buffer = split_buffer(buffer)
                    for sentence in sentences:
                        yield sentence
            for sentence in drain_buffer(buffer):
                yield sentence
        except openai.RateLimitError as e:
            logger.error("OpenAI rate limited (pass 2 stream): %s", e)
            yield "Sorry, the system is busy. Please try again."
        except openai.APIError as e:
            logger.error("OpenAI API error (pass 2 stream): %s", e)
            yield "Sorry, something went wrong. Please try again."

    def get_provider_name(self) -> str:
        return "openai"


def _error_response(model: str, raw: str, text: str = "") -> LLMResponse:
    return LLMResponse(
        intents=[],
        response_text=text,
        detected_language="en",
        raw_output=raw,
        model=model,
        provider="openai",
        prompt_tokens=0,
        completion_tokens=0,
    )
