"""Text normalization for menu matching.

The same `normalize()` function is applied to both user input and menu item
names during index building, so the resolver always compares like-with-like.
"""

from __future__ import annotations

import re
import unicodedata

# Filler words stripped from the START or END of an input only.
# Mid-string occurrences are preserved (e.g. "do" must survive in
# "bhindi do pyaaza").
FILLER_WORDS: frozenset[str] = frozenset(
    {
        "ek",
        "do",
        "teen",
        "char",
        "please",
        "pls",
        "one",
        "two",
        "three",
        "give",
        "me",
        "i",
        "want",
        "can",
        "get",
        "mujhe",
        "dena",
        "dijiye",
        "chahiye",
        "bhaiya",
        "bhai",
        "boss",
        "sir",
        "madam",
        "the",
        "a",
        "an",
        "some",
    }
)

# Multi-word filler phrases (also only stripped at start/end).
FILLER_PHRASES: tuple[tuple[str, ...], ...] = (
    ("give", "me"),
    ("i", "want"),
    ("i", "would", "like"),
    ("can", "i", "get"),
    ("can", "i", "have"),
    ("i", "ll", "have"),
    ("ill", "have"),
    ("can", "you", "get", "me"),
)

_PUNCT_RE = re.compile(r"[^\w\s]", flags=re.UNICODE)
_WS_RE = re.compile(r"\s+")


def _strip_accents(text: str) -> str:
    """Decompose unicode chars and drop combining marks (é -> e, ü -> u)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _strip_filler_edges(tokens: list[str]) -> list[str]:
    """Drop filler words/phrases from the leading and trailing edges only."""
    if not tokens:
        return tokens

    changed = True
    while changed and tokens:
        changed = False

        # Multi-word phrases first (longest first to avoid partial eats)
        for phrase in sorted(FILLER_PHRASES, key=len, reverse=True):
            n = len(phrase)
            if len(tokens) >= n and tuple(tokens[:n]) == phrase:
                tokens = tokens[n:]
                changed = True
                break
            if len(tokens) >= n and tuple(tokens[-n:]) == phrase:
                tokens = tokens[:-n]
                changed = True
                break

        # Single-word fillers
        if tokens and tokens[0] in FILLER_WORDS:
            tokens = tokens[1:]
            changed = True
        if tokens and tokens[-1] in FILLER_WORDS:
            tokens = tokens[:-1]
            changed = True

    return tokens


def normalize(text: str) -> str:
    """Normalize a free-text input or menu name into a canonical match string.

    Steps:
    1. Lowercase, strip whitespace.
    2. Strip accents/diacritics.
    3. Replace "&" with "and"; replace "n'"/"n’" with "and".
    4. Drop punctuation (keep hyphens between word characters).
    5. Collapse whitespace.
    6. Strip filler words/phrases from the leading and trailing edges only.
    """
    if text is None:
        return ""

    s = text.lower().strip()
    if not s:
        return ""

    s = _strip_accents(s)

    # & -> and
    s = s.replace("&", " and ")

    # Hyphens behave as word separators for matching purposes.
    s = s.replace("-", " ")

    # "mac n cheese" / "mac n' cheese" / "mac n’ cheese" / "rock 'n' roll"
    # Replace standalone "n" / "n'" between word boundaries with "and".
    s = re.sub(r"\bn['’]?\b", "and", s)

    # Drop remaining punctuation. Keep word chars and whitespace.
    s = _PUNCT_RE.sub(" ", s)

    # Collapse whitespace
    s = _WS_RE.sub(" ", s).strip()

    if not s:
        return ""

    tokens = s.split(" ")
    tokens = _strip_filler_edges(tokens)

    return " ".join(tokens)


def normalize_for_index(name: str) -> list[str]:
    """Generate normalized forms for a menu item name to register in the index.

    Currently returns the full normalized form only. Single-word ("faggotini")
    inputs are handled by step 4 partial matching against the full name —
    adding a synthetic last-word entry created false positives for short
    items (e.g. "americano" colliding with "iced americano").
    """
    full = normalize(name)
    if not full:
        return []
    return [full]
