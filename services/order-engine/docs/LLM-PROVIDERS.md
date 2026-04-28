# LLM Providers — Interface Guide

## Design Philosophy

The LLM provider abstraction exists for **development-phase testing only**. The goal is to compare Claude, OpenAI, and Gemini on the same inputs to pick the best model for intent extraction. In production, one model is used.

The abstraction is intentionally thin: one interface, one method. Each provider owns its own API call logic and prompt formatting quirks. The contract is on the **output shape** — structured intents — not on how the API is called.

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
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        pass
```

Every provider returns the same `LLMResponse` dataclass. The orchestrator doesn't care which provider it's talking to.

---

## Provider Factory

```python
# src/llm/__init__.py

def create_provider(provider_name: str, api_key: str, model: str | None = None) -> LLMProvider:
    """Factory function to create a provider by name."""
    if provider_name == "claude":
        from .claude_provider import ClaudeProvider
        return ClaudeProvider(api_key, model or "claude-sonnet-4-20250514")
    elif provider_name == "openai":
        from .openai_provider import OpenAIProvider
        return OpenAIProvider(api_key, model or "gpt-4o")
    elif provider_name == "gemini":
        from .gemini_provider import GeminiProvider
        return GeminiProvider(api_key, model or "gemini-2.0-flash")
    else:
        raise ValueError(f"Unknown provider: {provider_name}")
```

---

## Claude Provider (Full Implementation)

The primary provider. Uses the `anthropic` SDK.

**Key implementation details:**

1. System prompt goes in the `system` parameter (not as a user message).
2. Conversation history maps to `messages` array with `role: "user"` and `role: "assistant"`.
3. The response is in `response.content[0].text`.
4. Token usage is in `response.usage.input_tokens` and `response.usage.output_tokens`.
5. The `<intents>`, `<response>`, `<language>` tags are parsed by `intent_parser.py`.

**Error handling:**
- `anthropic.APIError` — log error, return LLMResponse with empty intents and error message as response_text
- `anthropic.RateLimitError` — log, return error response suggesting retry
- Network errors — catch broadly, return error response

**Do NOT retry automatically.** Let the orchestrator/CLI handle retries if needed.

---

## OpenAI Provider (Stub)

When someone implements this:

1. Install `openai` package
2. Use `client.chat.completions.create()`
3. System prompt goes in `messages[0]` with `role: "system"`
4. Map conversation history to the same `messages` format
5. Use the SAME system prompt text (from `system_prompt.py`) — the intent format is model-agnostic
6. Parse output with the same `intent_parser.py`
7. Token usage from `response.usage.prompt_tokens` / `response.usage.completion_tokens`

The intent extraction format (`<intents>`, `<response>`, `<language>` tags) works across all models — it's just XML-style tags in the output that we parse.

---

## Gemini Provider (Stub)

Similar to OpenAI. Use `google-generativeai` SDK. System instruction goes in `model.generate_content()` with `system_instruction` parameter.

---

## Mock Provider (For Testing)

For unit tests, create a mock that returns predetermined responses:

```python
class MockProvider(LLMProvider):
    def __init__(self, responses: list[LLMResponse]):
        """Pass a list of responses. Each call to extract_intents pops the next one."""
        self.responses = list(responses)
        self.call_count = 0
        self.last_inputs = []

    def extract_intents(self, transcript, menu_context, conversation_history,
                        resolver_feedback=None, order_state=None) -> LLMResponse:
        self.last_inputs.append({
            "transcript": transcript,
            "resolver_feedback": resolver_feedback,
            "order_state": order_state,
        })
        response = self.responses[self.call_count % len(self.responses)]
        self.call_count += 1
        return response

    def get_provider_name(self) -> str:
        return "mock"
```

This mock is used in `test_orchestrator.py` to test the full flow without API calls.

---

## Adding a New Provider

1. Create `src/llm/newprovider_provider.py`
2. Implement `LLMProvider` interface
3. Use `build_system_prompt()` for the system prompt — don't write a custom prompt
4. Use `parse_intents()` for output parsing — don't write a custom parser
5. Add to the factory function in `src/llm/__init__.py`
6. Add the API key to `.env.example`
7. Test with `python -m cli.conversation --provider newprovider`
