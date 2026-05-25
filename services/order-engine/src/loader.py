"""Menu loader and search index builder.

Reads menu.json once at startup and produces a MenuIndex containing flat
match entries, an alias dictionary, and lookup tables for items, variants,
and categories.

`load_menu_overlay_from_db` and `apply_overlay` extend this with a DB-sourced
price/active layer: prices are updated from `menu_items`, inactive items are
pruned. The file-loaded index is the structural source of truth; the DB is
the runtime override.
"""

from __future__ import annotations

import copy
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

from src.models import Category, IndexEntry, MenuItem, VariantItem
from src.normalizer import normalize, normalize_for_index


@dataclass
class MenuIndex:
    entries: list[IndexEntry] = field(default_factory=list)
    aliases: dict[str, str] = field(default_factory=dict)
    items_by_id: dict[str, MenuItem] = field(default_factory=dict)
    variants_by_id: dict[str, VariantItem] = field(default_factory=dict)
    categories: dict[str, Category] = field(default_factory=dict)

    @property
    def normalized_names(self) -> list[str]:
        return [e.normalized_name for e in self.entries]

    def entry_by_normalized(self, name: str) -> list[IndexEntry]:
        return [e for e in self.entries if e.normalized_name == name]

    def lookup_alias_target(self, item_id: str) -> tuple[str, str] | None:
        """Resolve an alias target to ('item' | 'variant' | 'group', id).

        Returns None if the id is not found in either lookup.
        """
        if item_id in self.items_by_id:
            item = self.items_by_id[item_id]
            kind = "group" if item.type == "variant_group" else "item"
            return (kind, item_id)
        if item_id in self.variants_by_id:
            return ("variant", item_id)
        return None


def load_menu(path: str | Path) -> MenuIndex:
    """Load menu.json and build the search index."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    index = MenuIndex()

    # --- Categories ---
    for cat_raw in raw.get("categories", []):
        cat = Category(
            id=cat_raw["id"],
            name=cat_raw["name"],
            available_from=cat_raw.get("available_from"),
            available_until=cat_raw.get("available_until"),
            available_days=cat_raw.get("available_days"),
        )
        index.categories[cat.id] = cat

    # --- Items + variants ---
    for item_raw in raw.get("items", []):
        item = MenuItem(
            id=item_raw["id"],
            name=item_raw["name"],
            category=item_raw["category"],
            type=item_raw["type"],
            price=item_raw.get("price"),
            description=item_raw.get("description"),
            tags=list(item_raw.get("tags", [])),
            modifiers=item_raw.get("modifiers"),
            serves=item_raw.get("serves"),
            available_from=item_raw.get("available_from"),
            available_until=item_raw.get("available_until"),
            available_days=item_raw.get("available_days"),
        )
        index.items_by_id[item.id] = item

        if item.type == "simple":
            _add_simple_entries(index, item)
        elif item.type == "variant_group":
            _add_variant_group_entries(index, item, item_raw.get("variants", []))
        else:  # pragma: no cover - safety net for unknown types
            raise ValueError(f"Unknown item type {item.type!r} for {item.id}")

    # --- Aliases ---
    for raw_alias, target_id in raw.get("aliases", {}).items():
        normalized = normalize(raw_alias)
        if not normalized:
            continue
        if target_id not in index.items_by_id and target_id not in index.variants_by_id:
            # Skip silently — surfacing as a warning would be noisy at startup.
            # Could be exposed via a debug command later.
            continue
        index.aliases[normalized] = target_id

    return index


def _add_simple_entries(index: MenuIndex, item: MenuItem) -> None:
    forms = normalize_for_index(item.name)
    for form in forms:
        index.entries.append(
            IndexEntry(
                normalized_name=form,
                item_id=item.id,
                item_name=item.name,
                price=item.price,
                category=item.category,
                is_variant=False,
                parent_id=None,
                parent_name=None,
                requires_variant_selection=False,
                requires_modifier=item.modifiers if item.modifiers else None,
            )
        )


def _add_variant_group_entries(
    index: MenuIndex, group: MenuItem, variant_raws: list[dict]
) -> None:
    # 1. Group-level entry — selecting this means we still need a variant choice.
    for form in normalize_for_index(group.name):
        index.entries.append(
            IndexEntry(
                normalized_name=form,
                item_id=group.id,
                item_name=group.name,
                price=None,
                category=group.category,
                is_variant=False,
                parent_id=None,
                parent_name=None,
                requires_variant_selection=True,
                requires_modifier=None,
            )
        )

    group_normalized = normalize(group.name)

    # 2. One entry per variant — variant name alone, plus compound forms.
    for v_raw in variant_raws:
        variant = VariantItem(
            id=v_raw["id"],
            name=v_raw["name"],
            price=v_raw["price"],
            parent_id=group.id,
            parent_name=group.name,
            parent_category=group.category,
            tags=list(v_raw.get("tags", [])),
        )
        index.variants_by_id[variant.id] = variant

        variant_normalized = normalize(variant.name)

        forms_to_add: list[str] = []
        # Only register the bare variant name when it's distinctive enough
        # to stand alone — single-word variants like "Plain", "Classic",
        # "Masala", "Veg", "Cheese" collide with arbitrary inputs and are
        # better reached via the compound forms or via aliases.
        if variant_normalized and len(variant_normalized.split()) >= 2:
            forms_to_add.append(variant_normalized)
        if group_normalized and variant_normalized:
            forms_to_add.append(f"{variant_normalized} {group_normalized}")
            forms_to_add.append(f"{group_normalized} {variant_normalized}")

        # Dedup while preserving order
        seen: set[str] = set()
        for form in forms_to_add:
            if form in seen:
                continue
            seen.add(form)
            index.entries.append(
                IndexEntry(
                    normalized_name=form,
                    item_id=variant.id,
                    item_name=f"{group.name} - {variant.name}",
                    price=variant.price,
                    category=group.category,
                    is_variant=True,
                    parent_id=group.id,
                    parent_name=group.name,
                    requires_variant_selection=False,
                    requires_modifier=group.modifiers if group.modifiers else None,
                )
            )


# ---------------------------------------------------------------------------
# DB overlay: price + active sync
# ---------------------------------------------------------------------------

_DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def load_aliases_from_db(
    db_url: str | None = None, restaurant_id: str | None = None
) -> dict[str, str]:
    """Query menu_item_aliases for this restaurant and return raw alias → json_item_id.

    The json_item_id is the petpooja external_id (e.g. "south_indian_filter_coffee"),
    which is the key format MenuIndex.aliases expects.

    Returns an empty dict if the DB is unreachable, the table is empty, or no
    restaurant_id is supplied — callers treat that as "use JSON aliases".
    """
    if not restaurant_id:
        return {}

    import psycopg2  # local import so the rest of loader works without psycopg2

    url = db_url or _DEFAULT_DB_URL
    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT a.alias, e.external_id
            FROM menu_item_aliases a
            JOIN external_id_mapping e
              ON e.internal_item_id = a.item_id AND e.provider = 'petpooja'
            WHERE a.restaurant_id = %s
            """,
            (restaurant_id,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        result = {alias: ext_id for alias, ext_id in rows}
        logger.info("Aliases loaded from DB: %d for restaurant %s", len(result), restaurant_id)
        return result
    except Exception as exc:
        logger.warning("DB unavailable for aliases, will fall back to JSON: %s", exc)
        return {}


def apply_aliases_overlay(index: MenuIndex, db_aliases: dict[str, str]) -> MenuIndex:
    """Replace index.aliases with DB-sourced aliases.

    If db_aliases is empty (DB unreachable or table has 0 rows), returns the
    original index unchanged so JSON aliases remain in effect as a fallback.
    """
    if not db_aliases:
        logger.info("Aliases loaded: 0 from DB — using JSON file aliases as fallback")
        return index

    new_index = copy.deepcopy(index)
    new_index.aliases = {}
    for raw_alias, target_id in db_aliases.items():
        normalized = normalize(raw_alias)
        if not normalized:
            continue
        if target_id not in new_index.items_by_id and target_id not in new_index.variants_by_id:
            continue
        new_index.aliases[normalized] = target_id

    logger.info(
        "Aliases loaded: %d from DB (raw: %d, skipped invalid targets: %d)",
        len(new_index.aliases),
        len(db_aliases),
        len(db_aliases) - len(new_index.aliases),
    )
    return new_index


def load_menu_overlay_from_db(db_url: str | None = None, restaurant_id: str | None = None) -> dict[str, dict]:
    """Query Supabase for current price and active state of every menu item.

    Returns a mapping from normalize(item_name) → {"price": int|None, "active": bool}.
    Filters by restaurant_id when provided so overlays are per-restaurant.
    Returns an empty dict (with a warning) if the DB is unreachable — callers
    treat an empty overlay as "use menu.json data as-is".
    """
    import psycopg2  # local import so the rest of loader works without psycopg2

    url = db_url or _DEFAULT_DB_URL
    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()
        if restaurant_id:
            cur.execute(
                """
                SELECT m.name, m.price, m.active
                FROM menu_items m
                WHERE m.restaurant_id = %s
                """,
                (restaurant_id,),
            )
        else:
            cur.execute(
                """
                SELECT m.name, m.price, m.active
                FROM menu_items m
                """
            )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        result = {
            normalize(name): {"price": int(price) if price is not None else None, "active": bool(active)}
            for name, price, active in rows
            if name
        }
        logger.info("Menu overlay loaded from DB: %d items (restaurant_id=%s)", len(result), restaurant_id)
        return result
    except Exception as exc:
        logger.warning("DB unavailable, using local menu.json cache: %s", exc)
        return {}


def apply_overlay(index: MenuIndex, overlay: dict[str, dict]) -> MenuIndex:
    """Return a new MenuIndex with DB prices/active status applied.

    The overlay maps normalize(item_name) → {"price": int|None, "active": bool}.
    Items/variants where active=False are pruned from entries, lookups, and aliases.
    Prices for active items are updated in-place on the deep-copied index.

    If overlay is empty (DB unavailable fallback), returns the original index unchanged.
    """
    if not overlay:
        return index

    # Translate overlay keys (normalised names) to JSON item IDs used internally.
    # overlay: {normalize(db_name) → {price, active}}
    # translated: {json_item_id → {price, active}}
    name_to_id = {normalize(item.name): item_id for item_id, item in index.items_by_id.items()}
    translated: dict[str, dict] = {}
    for norm_name, ov_data in overlay.items():
        item_id = name_to_id.get(norm_name)
        if item_id:
            translated[item_id] = ov_data

    if not translated:
        logger.warning("apply_overlay: no DB items matched JSON menu entries — overlay skipped (misconfiguration?)")
        return index

    new_index = copy.deepcopy(index)
    inactive_ids: set[str] = set()

    # Update / prune items
    for item_id in list(new_index.items_by_id):
        if item_id not in translated:
            continue
        ov = translated[item_id]
        if not ov["active"]:
            inactive_ids.add(item_id)
            del new_index.items_by_id[item_id]
        elif ov["price"] is not None:
            new_index.items_by_id[item_id].price = ov["price"]

    # Update / prune variants
    for var_id in list(new_index.variants_by_id):
        if var_id not in translated:
            continue
        ov = translated[var_id]
        if not ov["active"]:
            inactive_ids.add(var_id)
            del new_index.variants_by_id[var_id]
        elif ov["price"] is not None:
            new_index.variants_by_id[var_id].price = ov["price"]

    # Prune and update entries
    kept: list[IndexEntry] = []
    for entry in new_index.entries:
        if entry.item_id in inactive_ids:
            continue
        if entry.item_id in translated:
            ov = translated[entry.item_id]
            if ov["price"] is not None:
                entry.price = ov["price"]
        kept.append(entry)
    new_index.entries = kept

    # Prune aliases pointing to deactivated items
    new_index.aliases = {k: v for k, v in new_index.aliases.items() if v not in inactive_ids}
    logger.info("apply_overlay: %d items matched, %d deactivated", len(translated), len(inactive_ids))

    return new_index
