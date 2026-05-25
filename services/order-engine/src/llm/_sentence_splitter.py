"""Shared sentence-splitting utilities for streaming LLM providers.

All three providers (Claude, OpenAI, Gemini) use the same logic to split
token streams into sentence-sized chunks for TTS pipelining.
"""

from __future__ import annotations

import re

# Sentence-ending punctuation: Latin (.?!), Devanagari (।), full-width (?!)
_SENTENCE_END = re.compile(r'(?<=[.?!।！？])\s*')


def split_buffer(buffer: str) -> tuple[list[str], str]:
    """Split buffer on sentence boundaries.

    Returns (complete_sentences, remaining_buffer).
    Call this on each new token addition.
    """
    parts = _SENTENCE_END.split(buffer)
    sentences = [s.strip() for s in parts[:-1] if s.strip()]
    return sentences, parts[-1]


def drain_buffer(buffer: str) -> list[str]:
    """Flush any remaining text after the stream ends."""
    return [buffer.strip()] if buffer.strip() else []
