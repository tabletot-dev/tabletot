"""Precomputed in-memory graph of item relationships.

Built once at menu load from anchor_items and item_pairings DB tables.
Used only by the deterministic recommendation layer — never injected into LLM prompts.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


@dataclass
class AnchorEntry:
    item_id: str        # json_id — matches MenuIndex.items_by_id keys
    item_name: str
    anchor_type: str    # "chef_pick", "bestseller", "new", "signature"
    priority: int


@dataclass
class MenuGraph:
    """item_pairings edges + anchor_items, keyed by json_id."""

    anchors: list[AnchorEntry] = field(default_factory=list)
    pairings: dict[str, list[str]] = field(default_factory=dict)  # src_id → [tgt_id, ...]

    def anchors_by_type(self, anchor_type: str) -> list[AnchorEntry]:
        return [a for a in self.anchors if a.anchor_type == anchor_type]

    def pairs_for(self, item_id: str) -> list[str]:
        return self.pairings.get(item_id, [])

    @property
    def top_anchors(self) -> list[AnchorEntry]:
        """Chef picks first (up to 2), then bestsellers (up to 2)."""
        picks = self.anchors_by_type("chef_pick")[:2]
        bests = self.anchors_by_type("bestseller")[:2]
        return picks + bests


def load_menu_graph_from_db(
    db_url: str | None = None, restaurant_id: str | None = None
) -> MenuGraph:
    """Build a MenuGraph from anchor_items and item_pairings for a restaurant.

    Raises RuntimeError on DB failure so startup fails loudly.
    """
    if not restaurant_id:
        raise ValueError("restaurant_id is required for load_menu_graph_from_db")

    import psycopg2

    url = db_url or _DEFAULT_DB_URL
    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()

        cur.execute(
            """
            SELECT mi.json_id, mi.name, a.anchor_type, a.priority
            FROM   anchor_items a
            JOIN   menu_items mi ON mi.id = a.item_id
            WHERE  a.restaurant_id = %s
              AND  a.active = true
              AND  mi.json_id IS NOT NULL
            ORDER BY a.anchor_type, a.priority
            """,
            (restaurant_id,),
        )
        anchor_rows = cur.fetchall()

        cur.execute(
            """
            SELECT src.json_id, tgt.json_id, p.priority
            FROM   item_pairings p
            JOIN   menu_items src ON src.id = p.source_item_id
            JOIN   menu_items tgt ON tgt.id = p.paired_item_id
            WHERE  p.restaurant_id = %s
              AND  src.json_id IS NOT NULL
              AND  tgt.json_id IS NOT NULL
            ORDER BY src.json_id, p.priority
            """,
            (restaurant_id,),
        )
        pairing_rows = cur.fetchall()

        cur.close()
        conn.close()
    except Exception as exc:
        raise RuntimeError(f"load_menu_graph_from_db: DB unavailable: {exc}") from exc

    anchors = [
        AnchorEntry(
            item_id=json_id,
            item_name=name,
            anchor_type=anchor_type,
            priority=priority,
        )
        for json_id, name, anchor_type, priority in anchor_rows
    ]

    pairings: dict[str, list[str]] = {}
    for src_id, tgt_id, _ in pairing_rows:
        pairings.setdefault(src_id, []).append(tgt_id)

    logger.info(
        "MenuGraph loaded: %d anchors, %d pairing sources for restaurant %s",
        len(anchors),
        len(pairings),
        restaurant_id,
    )
    return MenuGraph(anchors=anchors, pairings=pairings)
