"""Data models for the menu resolver.

All structured data flowing through loader / resolver / CLI uses these
dataclasses. No raw dicts as public interfaces.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Union


@dataclass
class Category:
    id: str
    name: str
    available_from: str | None = None      # "07:00"
    available_until: str | None = None     # "11:00"
    available_days: list[str] | None = None  # ["mon", "tue", ...]


@dataclass
class MenuItem:
    id: str
    name: str
    category: str
    type: str                              # "simple" or "variant_group"
    price: int | None                      # None for variant_group (price lives on children)
    description: str | None = None
    tags: list[str] = field(default_factory=list)
    modifiers: dict | None = None          # {key: {label, options[], required, price_impact}}
    serves: int | None = None
    # Items themselves never carry time windows in the current menu — windows
    # come from the category. The fields are kept here for forward-compatibility
    # in case a single item gets a special window in the future.
    available_from: str | None = None
    available_until: str | None = None
    available_days: list[str] | None = None


@dataclass
class VariantItem:
    id: str
    name: str
    price: int
    parent_id: str
    parent_name: str
    parent_category: str
    tags: list[str] = field(default_factory=list)


@dataclass
class IndexEntry:
    """A single matchable entry in the search index."""

    normalized_name: str                   # lowercased, cleaned name used for matching
    item_id: str                           # the item or variant id this resolves to
    item_name: str                         # display name (for output)
    price: int | None
    category: str
    is_variant: bool                       # True if item_id is a variant child
    parent_id: str | None                  # group id, if this entry came from a variant
    parent_name: str | None
    requires_variant_selection: bool       # True if this points to a group, not a child
    requires_modifier: dict | None         # modifier defs if selection needed


# ---------- resolver result types ----------


@dataclass
class ConfidentMatch:
    item_id: str
    item_name: str
    price: int
    category: str
    score: float                           # 0-100
    match_method: str                      # "exact", "alias", "fuzzy", "fuzzy_partial"
    requires_modifier: dict | None = None


@dataclass
class NeedsVariantSelection:
    group_id: str
    group_name: str
    category: str
    variants: list[VariantItem]
    score: float
    match_method: str


@dataclass
class Ambiguous:
    raw_input: str
    candidates: list["ConfidentMatch | NeedsVariantSelection"]


@dataclass
class NoMatch:
    raw_input: str
    suggestions: list[tuple[str, float]]   # [(item_name, score), ...] top N closest


@dataclass
class Unavailable:
    item_id: str
    item_name: str
    reason: str                            # "Available 07:00-11:00" / "Available Mon-Fri 15:00-19:00"


@dataclass
class ChooseFromCategory:
    category: str
    options: list["ConfidentMatch"]
    score: float
    match_method: str


ResolveResult = Union[
    ConfidentMatch,
    NeedsVariantSelection,
    ChooseFromCategory,
    Ambiguous,
    NoMatch,
    Unavailable,
]
