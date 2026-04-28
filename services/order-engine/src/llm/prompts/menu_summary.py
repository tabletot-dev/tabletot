"""Generate a simplified menu summary for LLM context injection.

The output contains item names, categories, variant options, modifier choices,
and descriptions — but NO prices and NO IDs. This prevents the LLM from
hallucinating financial data.

Generated once at startup and reused for every LLM call.
"""

from __future__ import annotations


def generate_menu_summary(menu_data: dict) -> str:
    """Generate a simplified menu summary for LLM context injection.

    Args:
        menu_data: Raw menu.json data (dict with categories, items, aliases).

    Returns:
        A formatted string (~2,400 tokens) listing all menu items by category.
    """
    categories_by_id: dict[str, dict] = {}
    for cat in menu_data.get("categories", []):
        categories_by_id[cat["id"]] = cat

    # Group items by category, preserving menu order
    items_by_category: dict[str, list[dict]] = {}
    for item in menu_data.get("items", []):
        cat_id = item["category"]
        items_by_category.setdefault(cat_id, []).append(item)

    lines: list[str] = []

    # Iterate categories in their original order
    for cat in menu_data.get("categories", []):
        cat_id = cat["id"]
        items = items_by_category.get(cat_id)
        if not items:
            continue

        # Category header with time window if applicable
        header = f"## {cat['name']}"
        time_note = _format_time_window(cat)
        if time_note:
            header += f" ({time_note})"
        lines.append(header)

        for item in items:
            lines.append(_format_item(item))

        lines.append("")  # blank line between categories

    return "\n".join(lines).strip()


def _format_item(item: dict) -> str:
    """Format a single menu item as a line."""
    tag = _format_tag(item.get("tags", []))
    name = item["name"]

    if item["type"] == "variant_group":
        variants = item.get("variants", [])
        variant_names = [v["name"] for v in variants]
        line = f"- {name}{tag} — choose: {', '.join(variant_names)}"
    else:
        line = f"- {name}{tag}"
        desc = item.get("description")
        if desc:
            line += f" — {desc}"

    # Modifiers
    modifiers = item.get("modifiers")
    if modifiers:
        mod_parts = []
        for _key, defn in modifiers.items():
            label = defn.get("label", _key)
            opts = defn.get("options", [])
            mod_parts.append(f"{label}: {'/'.join(opts)}")
        line += f" (Choose: {'; '.join(mod_parts)})"

    return line


def _format_tag(tags: list[str]) -> str:
    """Return [V] or [NV] based on tags."""
    if "veg" in tags:
        return " [V]"
    if "non-veg" in tags:
        return " [NV]"
    return ""


def _format_time_window(cat: dict) -> str:
    """Format time window string from category data."""
    avail_from = cat.get("available_from")
    avail_until = cat.get("available_until")
    if not avail_from or not avail_until:
        return ""

    parts = [f"Available {avail_from}-{avail_until}"]

    days = cat.get("available_days")
    if days and len(days) < 7:
        day_str = ", ".join(d.capitalize() for d in days)
        parts.append(day_str)

    return ", ".join(parts)
