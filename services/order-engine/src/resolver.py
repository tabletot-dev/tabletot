"""The matching cascade — the core resolver.

`resolve(raw_input, index, current_time) -> ResolveResult`

Pure function. No side effects. Five-step cascade:
  1. Exact normalized match
  2. Alias lookup
  3. Fuzzy match (token_sort + partial_ratio combined)
  4. Fuzzy match (partial_ratio only, higher threshold)
  5. NoMatch with closest suggestions
"""

from __future__ import annotations

from datetime import datetime

from rapidfuzz import fuzz, process

from src.loader import MenuIndex
from src.models import (
    Ambiguous,
    ConfidentMatch,
    IndexEntry,
    NeedsVariantSelection,
    NoMatch,
    ResolveResult,
    Unavailable,
    VariantItem,
)
from src.normalizer import normalize
from src.time_check import check_availability

# ---- Tunable thresholds ----------------------------------------------------

FUZZY_CONFIDENT_THRESHOLD = 80
"""Below this combined score (0-100), step 3 fuzzy match is not viable."""

FUZZY_AMBIGUITY_GAP = 10
"""If the top two fuzzy scores are within this gap, treat the result as ambiguous."""

PARTIAL_MATCH_THRESHOLD = 90
"""Higher threshold for the partial-only step 4 (more false-positive prone)."""

PARTIAL_MIN_INPUT_LENGTH = 4
"""Inputs shorter than this skip step 4 — partial matching on tiny strings
is dominated by accidental substrings (e.g. 'ice' inside 'juice')."""

MAX_AMBIGUOUS_CANDIDATES = 5
"""Maximum candidates returned in an Ambiguous result."""

MAX_SUGGESTIONS_ON_FAIL = 3
"""Maximum suggestions returned in a NoMatch result."""

MIN_INPUT_LENGTH = 2
"""Inputs shorter than this normalize-length skip the cascade and return NoMatch."""


# ---- Public entrypoint -----------------------------------------------------


def resolve(
    raw_input: str,
    index: MenuIndex,
    current_time: datetime | None = None,
) -> ResolveResult:
    """Resolve a raw input string against the menu index.

    Pure function. `current_time=None` disables availability checks.
    """
    normalized = normalize(raw_input)
    if not normalized or len(normalized) < MIN_INPUT_LENGTH:
        return NoMatch(raw_input=raw_input, suggestions=[])

    # Step 1 — exact match
    result = _step1_exact(normalized, index, current_time)
    if result is not None:
        return result

    # Step 2 — alias lookup
    result = _step2_alias(normalized, index, current_time, raw_input)
    if result is not None:
        return result

    # Step 3 — fuzzy combined (token_sort + partial)
    result = _step3_fuzzy(normalized, index, current_time, raw_input)
    if result is not None:
        return result

    # Step 4 — fuzzy partial-only (more aggressive)
    result = _step4_fuzzy_partial(normalized, index, current_time, raw_input)
    if result is not None:
        return result

    # Step 5 — no match, return closest suggestions
    return _step5_no_match(normalized, index, raw_input)


# ---- Step 1: exact ---------------------------------------------------------


def _step1_exact(
    normalized: str, index: MenuIndex, current_time: datetime | None
) -> ResolveResult | None:
    matches = [e for e in index.entries if e.normalized_name == normalized]
    if not matches:
        return None

    # Dedupe by item_id (an entry's compound forms can collide on a short input)
    unique_by_id: dict[str, IndexEntry] = {}
    for e in matches:
        unique_by_id.setdefault(e.item_id, e)

    if len(unique_by_id) == 1:
        return _entry_to_result(
            next(iter(unique_by_id.values())),
            score=100.0,
            method="exact",
            index=index,
            current_time=current_time,
        )

    # Multiple distinct items share the same normalized name → ambiguous.
    candidates = [
        _entry_to_result(e, 100.0, "exact", index, current_time=None)
        for e in unique_by_id.values()
    ]
    candidates = [c for c in candidates if not isinstance(c, Unavailable)]
    return Ambiguous(raw_input=normalized, candidates=candidates[:MAX_AMBIGUOUS_CANDIDATES])


# ---- Step 2: alias ---------------------------------------------------------


def _step2_alias(
    normalized: str,
    index: MenuIndex,
    current_time: datetime | None,
    raw_input: str,
) -> ResolveResult | None:
    target_id = index.aliases.get(normalized)
    if target_id is None:
        return None

    target = index.lookup_alias_target(target_id)
    if target is None:
        return None
    kind, _ = target

    if kind == "item":
        item = index.items_by_id[target_id]
        if item.type == "variant_group":
            return _build_variant_selection(item.id, index, score=100.0, method="alias")
        match = ConfidentMatch(
            item_id=item.id,
            item_name=item.name,
            price=item.price or 0,
            category=item.category,
            score=100.0,
            match_method="alias",
            requires_modifier=item.modifiers if item.modifiers else None,
        )
        reason = check_availability(item, index, current_time)
        if reason:
            return Unavailable(item_id=item.id, item_name=item.name, reason=reason)
        return match

    if kind == "group":
        return _build_variant_selection(target_id, index, score=100.0, method="alias")

    if kind == "variant":
        variant = index.variants_by_id[target_id]
        match = ConfidentMatch(
            item_id=variant.id,
            item_name=f"{variant.parent_name} - {variant.name}",
            price=variant.price,
            category=variant.parent_category,
            score=100.0,
            match_method="alias",
            requires_modifier=_modifiers_for_variant(variant, index),
        )
        reason = check_availability(variant, index, current_time)
        if reason:
            return Unavailable(item_id=variant.id, item_name=match.item_name, reason=reason)
        return match

    return None  # pragma: no cover


# ---- Step 3: fuzzy combined ------------------------------------------------


def _step3_fuzzy(
    normalized: str,
    index: MenuIndex,
    current_time: datetime | None,
    raw_input: str,
) -> ResolveResult | None:
    return _fuzzy_pass(
        normalized,
        index,
        current_time,
        raw_input,
        scorers=("token_sort",),
        threshold=FUZZY_CONFIDENT_THRESHOLD,
        method_label="fuzzy",
    )


# ---- Step 4: fuzzy partial only --------------------------------------------


def _step4_fuzzy_partial(
    normalized: str,
    index: MenuIndex,
    current_time: datetime | None,
    raw_input: str,
) -> ResolveResult | None:
    if len(normalized) < PARTIAL_MIN_INPUT_LENGTH:
        return None
    return _fuzzy_pass(
        normalized,
        index,
        current_time,
        raw_input,
        scorers=("partial",),
        threshold=PARTIAL_MATCH_THRESHOLD,
        method_label="fuzzy_partial",
    )


def _fuzzy_pass(
    normalized: str,
    index: MenuIndex,
    current_time: datetime | None,
    raw_input: str,
    scorers: tuple[str, ...],
    threshold: float,
    method_label: str,
) -> ResolveResult | None:
    if not index.entries:
        return None

    entry_names = index.normalized_names
    alias_keys = list(index.aliases.keys())
    # Include alias keys in the candidate pool so fuzzy steps can match
    # e.g. "pancake" against alias "pancake" (normalized from "pancakes").
    combined = entry_names + alias_keys
    n_entries = len(entry_names)

    # Per-candidate combined score: max across requested scorers.
    scores_by_idx: dict[int, float] = {}
    for scorer_name in scorers:
        scorer = _SCORERS[scorer_name]
        results = process.extract(normalized, combined, scorer=scorer, limit=20)
        for _matched_name, score, idx in results:
            if score > scores_by_idx.get(idx, 0.0):
                scores_by_idx[idx] = score

    if not scores_by_idx:
        return None

    # Pick best score per item_id.
    # Entry hits (idx < n_entries) → look up via index.entries[idx].
    # Alias hits (idx >= n_entries) → resolve alias key to target item_id,
    # then use any entry for that item_id (just needed for _entry_to_result).
    best_per_item: dict[str, tuple[float, IndexEntry]] = {}
    for idx, score in scores_by_idx.items():
        if idx < n_entries:
            entry = index.entries[idx]
            existing = best_per_item.get(entry.item_id)
            if existing is None or score > existing[0]:
                best_per_item[entry.item_id] = (score, entry)
        else:
            alias_key = alias_keys[idx - n_entries]
            target_id = index.aliases.get(alias_key)
            if target_id is None:
                continue
            target_entry = next((e for e in index.entries if e.item_id == target_id), None)
            if target_entry is None:
                continue
            existing = best_per_item.get(target_id)
            if existing is None or score > existing[0]:
                best_per_item[target_id] = (score, target_entry)

    ranked = sorted(best_per_item.values(), key=lambda t: t[0], reverse=True)
    if not ranked:
        return None

    top_score, top_entry = ranked[0]
    if top_score < threshold:
        return None

    second_score = ranked[1][0] if len(ranked) > 1 else 0.0
    gap = top_score - second_score

    if gap >= FUZZY_AMBIGUITY_GAP:
        return _entry_to_result(
            top_entry,
            score=float(top_score),
            method=method_label,
            index=index,
            current_time=current_time,
        )

    # Otherwise: collect everything within the ambiguity window.
    cluster = [(s, e) for s, e in ranked if (top_score - s) < FUZZY_AMBIGUITY_GAP]

    # If every clustered candidate belongs to the same variant group, fold them
    # into a single NeedsVariantSelection for that group.
    parent_ids = {e.parent_id for _, e in cluster if e.is_variant and e.parent_id}
    only_variants = all(e.is_variant and e.parent_id for _, e in cluster)
    if only_variants and len(parent_ids) == 1:
        group_id = next(iter(parent_ids))
        return _build_variant_selection(
            group_id, index, score=float(top_score), method=method_label
        )

    # Build candidate list for Ambiguous result.
    candidates: list[ConfidentMatch | NeedsVariantSelection] = []
    seen_ids: set[str] = set()
    for score, entry in cluster[:MAX_AMBIGUOUS_CANDIDATES]:
        if entry.item_id in seen_ids:
            continue
        seen_ids.add(entry.item_id)
        result = _entry_to_result(
            entry, float(score), method_label, index, current_time=None
        )
        if isinstance(result, (ConfidentMatch, NeedsVariantSelection)):
            candidates.append(result)

    if len(candidates) == 1:
        # Cluster collapsed to a single distinct item — promote to confident.
        only = candidates[0]
        if isinstance(only, ConfidentMatch):
            reason = (
                check_availability(
                    index.items_by_id.get(only.item_id)
                    or index.variants_by_id.get(only.item_id),  # type: ignore[arg-type]
                    index,
                    current_time,
                )
                if current_time
                else None
            )
            if reason:
                return Unavailable(
                    item_id=only.item_id, item_name=only.item_name, reason=reason
                )
        return only

    return Ambiguous(raw_input=raw_input, candidates=candidates)


_SCORERS = {
    "token_sort": fuzz.token_sort_ratio,
    "partial": fuzz.partial_ratio,
    "wratio": fuzz.WRatio,
}


# ---- Step 5: no match ------------------------------------------------------


def _step5_no_match(normalized: str, index: MenuIndex, raw_input: str) -> NoMatch:
    if not index.entries:
        return NoMatch(raw_input=raw_input, suggestions=[])

    names = index.normalized_names
    results = process.extract(
        normalized, names, scorer=fuzz.token_sort_ratio, limit=MAX_SUGGESTIONS_ON_FAIL * 3
    )

    # Dedupe by display name
    seen: set[str] = set()
    suggestions: list[tuple[str, float]] = []
    for _matched_name, score, idx in results:
        entry = index.entries[idx]
        if entry.item_name in seen:
            continue
        seen.add(entry.item_name)
        suggestions.append((entry.item_name, float(score)))
        if len(suggestions) >= MAX_SUGGESTIONS_ON_FAIL:
            break

    return NoMatch(raw_input=raw_input, suggestions=suggestions)


# ---- Helpers ---------------------------------------------------------------


def _entry_to_result(
    entry: IndexEntry,
    score: float,
    method: str,
    index: MenuIndex,
    current_time: datetime | None,
) -> ResolveResult:
    if entry.requires_variant_selection:
        return _build_variant_selection(entry.item_id, index, score, method)

    if entry.is_variant:
        variant = index.variants_by_id[entry.item_id]
        match = ConfidentMatch(
            item_id=variant.id,
            item_name=f"{variant.parent_name} - {variant.name}",
            price=variant.price,
            category=variant.parent_category,
            score=score,
            match_method=method,
            requires_modifier=entry.requires_modifier,
        )
        if current_time is not None:
            reason = check_availability(variant, index, current_time)
            if reason:
                return Unavailable(
                    item_id=variant.id, item_name=match.item_name, reason=reason
                )
        return match

    item = index.items_by_id[entry.item_id]
    match = ConfidentMatch(
        item_id=item.id,
        item_name=item.name,
        price=item.price or 0,
        category=item.category,
        score=score,
        match_method=method,
        requires_modifier=item.modifiers if item.modifiers else None,
    )
    if current_time is not None:
        reason = check_availability(item, index, current_time)
        if reason:
            return Unavailable(item_id=item.id, item_name=item.name, reason=reason)
    return match


def _build_variant_selection(
    group_id: str, index: MenuIndex, score: float, method: str
) -> NeedsVariantSelection:
    group = index.items_by_id[group_id]
    variants = [
        v for v in index.variants_by_id.values() if v.parent_id == group_id
    ]
    return NeedsVariantSelection(
        group_id=group.id,
        group_name=group.name,
        category=group.category,
        variants=variants,
        score=score,
        match_method=method,
    )


def _modifiers_for_variant(variant: VariantItem, index: MenuIndex) -> dict | None:
    parent = index.items_by_id.get(variant.parent_id)
    if parent and parent.modifiers:
        return parent.modifiers
    return None


