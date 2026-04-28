"""LLM provider layer for intent extraction."""

from .base import LLMProvider, LLMResponse


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
