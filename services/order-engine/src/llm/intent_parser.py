"""Parse and validate LLM output into structured intents.

The LLM is instructed to output:
    <intents>[...]</intents>
    <response>...</response>
    <language>...</language>

This module extracts those sections and validates each intent dict.
No API dependency — pure string parsing.
"""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

VALID_ACTIONS = frozenset({
    "add_item",
    "remove_item",
    "modify_item",
    "select_variant",
    "confirm_order",
    "ask_menu",
    "accept_upsell",
    "reject_upsell",
    "none",
})


def parse_intents(raw_output: str) -> tuple[list[dict], str, str]:
    """Parse LLM output into (intents_list, response_text, detected_language).

    If parsing fails, returns a safe fallback:
    - intents = []
    - response_text = raw_output
    - detected_language = "en"
    """
    intents = _extract_intents(raw_output)
    response_text = _extract_tag(raw_output, "response") or raw_output.strip()
    detected_language = _extract_tag(raw_output, "language") or "en"

    validated = []
    for intent in intents:
        valid = _validate_intent(intent)
        if valid is not None:
            validated.append(valid)

    return validated, response_text, detected_language.strip().lower()


def _extract_intents(raw_output: str) -> list[dict]:
    """Extract and parse JSON from <intents> tags."""
    match = re.search(r"<intents>\s*(.*?)\s*</intents>", raw_output, re.DOTALL)
    if not match:
        logger.warning("No <intents> tags found in LLM output")
        return []

    json_str = match.group(1).strip()
    if not json_str:
        return []

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse intents JSON: %s", e)
        return []

    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return [parsed]

    logger.warning("Intents JSON is not a list or dict: %s", type(parsed))
    return []


def _extract_tag(raw_output: str, tag: str) -> str | None:
    """Extract content from a simple XML-like tag."""
    match = re.search(rf"<{tag}>\s*(.*?)\s*</{tag}>", raw_output, re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


def _validate_intent(intent: dict) -> dict | None:
    """Validate and normalize a single intent dict. Returns None if invalid."""
    if not isinstance(intent, dict):
        logger.warning("Intent is not a dict: %s", type(intent))
        return None

    action = intent.get("action")
    if action not in VALID_ACTIONS:
        logger.warning("Invalid action '%s', dropping intent", action)
        return None

    # Actions that require a non-empty raw_name
    needs_name = action in ("add_item", "remove_item", "modify_item", "select_variant")
    raw_name = str(intent.get("raw_name", "")).strip()
    if needs_name and not raw_name:
        logger.warning("Action '%s' requires raw_name, dropping intent", action)
        return None

    # Normalize quantity
    quantity = intent.get("quantity", 1)
    try:
        quantity = int(quantity)
    except (ValueError, TypeError):
        quantity = 1
    if quantity < 1:
        quantity = 1

    # Normalize modifiers
    modifiers = intent.get("modifiers", [])
    if not isinstance(modifiers, list):
        modifiers = []
    modifiers = [str(m) for m in modifiers if m]

    # Normalize special_notes
    special_notes = str(intent.get("special_notes", "")).strip()

    return {
        "action": action,
        "raw_name": raw_name,
        "quantity": quantity,
        "modifiers": modifiers,
        "special_notes": special_notes,
    }
