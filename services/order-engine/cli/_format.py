"""Shared output formatting helpers for CLI commands."""

from __future__ import annotations

from src.models import (
    Ambiguous,
    ConfidentMatch,
    NeedsVariantSelection,
    NoMatch,
    ResolveResult,
    Unavailable,
)


def format_result(result: ResolveResult) -> str:
    if isinstance(result, ConfidentMatch):
        lines = [
            f"MATCH: {result.item_name}",
            f"   ID: {result.item_id} | Price: ₹{result.price} | Category: {result.category}",
            f"   Score: {result.score:.1f} | Method: {result.match_method}",
        ]
        if result.requires_modifier:
            lines.append(f"   Modifier required: {_modifier_summary(result.requires_modifier)}")
        return "\n".join(lines)

    if isinstance(result, NeedsVariantSelection):
        lines = [
            f"VARIANT NEEDED: {result.group_name}",
            "   Which one?",
        ]
        for i, v in enumerate(result.variants, 1):
            lines.append(f"   {i}. {v.name} — ₹{v.price}")
        lines.append(f"   Score: {result.score:.1f} | Method: {result.match_method}")
        return "\n".join(lines)

    if isinstance(result, Ambiguous):
        lines = [f'AMBIGUOUS: "{result.raw_input}" matched multiple items']
        for i, c in enumerate(result.candidates, 1):
            if isinstance(c, ConfidentMatch):
                lines.append(
                    f"   {i}. {c.item_name} — ₹{c.price} (score: {c.score:.1f})"
                )
            elif isinstance(c, NeedsVariantSelection):
                lines.append(
                    f"   {i}. {c.group_name} (variant group, score: {c.score:.1f})"
                )
        return "\n".join(lines)

    if isinstance(result, NoMatch):
        lines = [f'NO MATCH: "{result.raw_input}"']
        if result.suggestions:
            lines.append("   Closest suggestions:")
            for i, (name, score) in enumerate(result.suggestions, 1):
                lines.append(f"   {i}. {name} — score: {score:.1f}")
        return "\n".join(lines)

    if isinstance(result, Unavailable):
        return (
            f"UNAVAILABLE: {result.item_name}\n"
            f"   Reason: {result.reason}"
        )

    return repr(result)  # pragma: no cover


def _modifier_summary(modifiers: dict) -> str:
    parts = []
    for key, defn in modifiers.items():
        label = defn.get("label", key)
        opts = defn.get("options", [])
        parts.append(f"{label} ({'/'.join(opts)})")
    return "; ".join(parts)
