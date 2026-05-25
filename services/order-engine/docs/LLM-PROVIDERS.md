# LLM Providers — Interface Guide

## Design Philosophy

The LLM provider abstraction exists for **development-phase testing**. The goal is to compare Claude, OpenAI, and Gemini on the same inputs to pick the best model for production. In production, one model is selected via env var — no code change required.

The abstraction is intentionally thin: one interface, shared prompt builders, shared output parser. The contract is on the **output shape** — structured intents and natural-language response — not on how the API is called.

---

## Interface

```python
class LLMProvider(ABC):
    @abstractmethod
    def extract_intents(
        self,
        transcript: str,
        menu_context: str,
        conversation_history: list[dict],
        resolver_feedback: list[dict] | None = None,
        order_state: dict | None = None,
    ) -> LLMResponse:
        """Pass 1: extract structured intents + detected language. No user-facing reply."""

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
    ) -> LLMResponse:
        """Pass 2: generate customer-facing reply grounded in real resolver outcomes."""

    async def generate_response_stream(self, ...) -> AsyncIterator[str]:
        """Pass 2, streaming variant: yields sentence-sized chunks as they are generated.

        Default fallback calls generate_response() and yields the full text as one chunk.
        Override for lower perceived latency — first TTS audio starts before the LLM
        finishes generating the full response.
        """

    @abstractmethod
    def get_provider_name(self) -> str:
        pass
```

Every provider returns the same `LLMResponse` dataclass. The orchestrator doesn't care which provider it's talking to.

---

## Switching Providers

Set these env vars in `.env` and restart the backend — no code changes needed:

```bash
# Choose: claude | openai | gemini
LLM_PROVIDER=claude

# Must be set explicitly. If blank, provider default is used.
# Claude:  claude-haiku-4-5-20251001 | claude-sonnet-4-6 | claude-opus-4-7
# OpenAI:  gpt-4o-mini | gpt-4o
# Gemini:  gemini-2.0-flash | gemini-2.5-flash | gemini-2.5-pro
LLM_MODEL=claude-haiku-4-5-20251001

# API key for whichever provider is selected
ANTHROPIC_API_KEY=...   # used when LLM_PROVIDER=claude
OPENAI_API_KEY=...      # used when LLM_PROVIDER=openai
GEMINI_API_KEY=...      # used when LLM_PROVIDER=gemini
```

The backend reads `LLM_PROVIDER` at startup and selects the corresponding API key automatically.

---

## Provider Factory

```python
# src/llm/__init__.py
def create_provider(provider_name: str, api_key: str, model: str | None = None) -> LLMProvider:
    if provider_name == "claude":
        return ClaudeProvider(api_key, model or "claude-haiku-4-5-20251001")
    elif provider_name == "openai":
        return OpenAIProvider(api_key, model or "gpt-4o-mini")
    elif provider_name == "gemini":
        return GeminiProvider(api_key, model or "gemini-2.0-flash")
```

---

## Claude Provider

Primary provider. Uses `anthropic.Anthropic` (sync) + `anthropic.AsyncAnthropic` (streaming).

| Detail | Value |
|--------|-------|
| SDK | `anthropic` (in core deps) |
| System prompt | `system=` kwarg |
| History format | `role: user / assistant` |
| Streaming | `AsyncAnthropic.messages.stream()` → `stream.text_stream` |
| Token fields | `usage.input_tokens` / `usage.output_tokens` |

`generate_response_stream()` is **fully implemented** — yields sentence chunks via the shared `_sentence_splitter` module.

---

## OpenAI Provider

Uses `openai.OpenAI` (sync) + `openai.AsyncOpenAI` (streaming).

| Detail | Value |
|--------|-------|
| SDK | `openai` — `pip install openai` or `pip install ".[openai]"` |
| System prompt | First message with `role: system` |
| History format | `role: user / assistant` — identical to Claude, no conversion needed |
| Streaming | `AsyncOpenAI.chat.completions.create(stream=True, stream_options={"include_usage": True})` |
| Token fields | `usage.prompt_tokens` / `usage.completion_tokens` |

`generate_response_stream()` is **fully implemented**.

---

## Gemini Provider

Uses the `google-genai` SDK — **not** `google-generativeai` (deprecated Nov 2025).

| Detail | Value |
|--------|-------|
| SDK | `google-genai` — `pip install google-genai` or `pip install ".[gemini]"` |
| System prompt | `types.GenerateContentConfig(system_instruction=...)` |
| History format | `role: user / model`, content in `parts: [{text: ...}]` — converted from OpenAI-style by `_to_gemini_contents()` inside the provider |
| Streaming | `client.aio.models.generate_content_stream()` |
| Token fields | `usage_metadata.prompt_token_count` / `usage_metadata.candidates_token_count` |

`generate_response_stream()` is **fully implemented**.

---

## Sentence Splitter (Shared)

All three providers import from `src/llm/_sentence_splitter.py` to avoid duplicating the streaming logic:

```python
from ._sentence_splitter import split_buffer, drain_buffer

buffer = ""
async for token in stream:
    buffer += token
    sentences, buffer = split_buffer(buffer)   # yields on .?!।
    for sentence in sentences:
        yield sentence
for sentence in drain_buffer(buffer):          # flush remainder at stream end
    yield sentence
```

Split boundaries: `.`, `?`, `!`, `।` (Devanagari danda), `！`, `？` (full-width).

---

## Mock Provider (For Testing)

```python
class MockProvider(LLMProvider):
    def __init__(self, responses: list[LLMResponse]):
        self._responses = list(responses)
        self._idx = 0

    def extract_intents(self, transcript, menu_context, conversation_history,
                        resolver_feedback=None, order_state=None) -> LLMResponse:
        r = self._responses[self._idx % len(self._responses)]
        self._idx += 1
        return r

    def generate_response(self, transcript, menu_context, conversation_history,
                          extracted_intents, turn_outcomes, current_order,
                          detected_language) -> LLMResponse:
        return LLMResponse(intents=[], response_text="ok", ...)

    def get_provider_name(self) -> str:
        return "mock"
```

`generate_response_stream()` is inherited from base — calls `generate_response()` and yields the full text as one chunk. No override needed in tests.

---

## Adding a New Provider

1. Create `src/llm/newprovider_provider.py`, implement `LLMProvider`
2. Use `build_intent_extraction_prompt()` and `build_response_prompt()` — don't write custom prompts
3. Use `parse_intents()` for output parsing — the XML tag format works across all models
4. Import `split_buffer` / `drain_buffer` from `_sentence_splitter` for streaming
5. Add to factory in `src/llm/__init__.py`
6. Add `NEWPROVIDER_API_KEY` to `.env.example`
7. Test with `python -m cli.conversation --provider newprovider`
