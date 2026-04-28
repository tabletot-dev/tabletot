"""Availability checking for menu items based on time-of-day and day-of-week.

Categories carry the time windows in this menu (e.g. breakfast 07:00-11:00,
high tea Mon-Fri 15:00-19:00). Items themselves can also carry their own
window in case the menu is extended later — item-level windows take precedence
when present.
"""

from __future__ import annotations

from datetime import datetime, time

from src.loader import MenuIndex
from src.models import Category, MenuItem, VariantItem

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_LABELS = {
    "mon": "Mon",
    "tue": "Tue",
    "wed": "Wed",
    "thu": "Thu",
    "fri": "Fri",
    "sat": "Sat",
    "sun": "Sun",
}


def check_availability(
    item: MenuItem | VariantItem,
    index: MenuIndex,
    current_time: datetime | None,
) -> str | None:
    """Return None if `item` is currently available; otherwise a reason string.

    `current_time=None` skips all checks (useful for tests / batch runs).
    """
    if current_time is None:
        return None

    # Resolve to the underlying MenuItem (variants delegate to their parent's category)
    if isinstance(item, VariantItem):
        category_id = item.parent_category
        item_window = (None, None, None)  # variants don't carry windows
    else:
        category_id = item.category
        item_window = (item.available_from, item.available_until, item.available_days)

    category = index.categories.get(category_id)

    # Item-level window overrides category if set; otherwise inherit from category.
    item_from, item_until, item_days = item_window
    if item_from or item_until or item_days:
        windows: list[tuple[str | None, str | None, list[str] | None]] = [
            (item_from, item_until, item_days)
        ]
    else:
        windows = []
        if category is not None and (
            category.available_from
            or category.available_until
            or category.available_days
        ):
            windows.append(
                (category.available_from, category.available_until, category.available_days)
            )

    if not windows:
        return None  # No windows defined → always available

    for w_from, w_until, w_days in windows:
        reason = _check_one_window(current_time, w_from, w_until, w_days, category)
        if reason is not None:
            return reason

    return None


def _check_one_window(
    now: datetime,
    w_from: str | None,
    w_until: str | None,
    w_days: list[str] | None,
    category: Category | None,
) -> str | None:
    today = DAY_NAMES[now.weekday()]
    if w_days and today not in w_days:
        return f"Available {_format_window(w_from, w_until, w_days)}"

    if w_from and w_until:
        start = _parse_clock(w_from)
        end = _parse_clock(w_until)
        if not (start <= now.time() <= end):
            return f"Available {_format_window(w_from, w_until, w_days)}"

    return None


def _parse_clock(s: str) -> time:
    hh, mm = s.split(":")
    return time(int(hh), int(mm))


def _format_window(
    w_from: str | None, w_until: str | None, w_days: list[str] | None
) -> str:
    parts: list[str] = []
    if w_days and len(w_days) < 7:
        parts.append(_format_day_range(w_days))
    if w_from and w_until:
        parts.append(f"{w_from}-{w_until}")
    return " ".join(parts) if parts else "limited hours"


def _format_day_range(days: list[str]) -> str:
    """Render ['mon','tue','wed','thu','fri'] as 'Mon-Fri'."""
    indexes = sorted(DAY_NAMES.index(d) for d in days if d in DAY_NAMES)
    if not indexes:
        return ""
    # Single contiguous run? collapse to start-end.
    if indexes == list(range(indexes[0], indexes[-1] + 1)):
        if indexes[0] == indexes[-1]:
            return DAY_LABELS[DAY_NAMES[indexes[0]]]
        return f"{DAY_LABELS[DAY_NAMES[indexes[0]]]}-{DAY_LABELS[DAY_NAMES[indexes[-1]]]}"
    return ",".join(DAY_LABELS[DAY_NAMES[i]] for i in indexes)
