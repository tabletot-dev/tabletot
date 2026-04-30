#!/usr/bin/env python3
"""
Import menu item aliases from menus/roast-ccx-hyd.json into menu_item_aliases.

Usage:
    python scripts/import_aliases.py

Reads DATABASE_URL from environment (falls back to local Supabase default).
Must be run AFTER import_menu.py (requires menu_items + external_id_mapping to exist).
Safe to re-run: uses ON CONFLICT DO NOTHING.
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ORDER_ENGINE_DIR = REPO_ROOT / "services" / "order-engine"
load_dotenv(ORDER_ENGINE_DIR / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)
MENU_FILE = ORDER_ENGINE_DIR / "menus" / "roast-ccx-hyd.json"
RESTAURANT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
PROVIDER = "petpooja"


def main() -> None:
    if not MENU_FILE.exists():
        print(f"ERROR: Menu file not found: {MENU_FILE}", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(MENU_FILE.read_text(encoding="utf-8"))
    aliases: dict[str, str] = raw.get("aliases", {})
    print(f"Aliases in JSON : {len(aliases)}")

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Backfill restaurant_id on any menu_items rows that arrived after seed.sql ran.
    cur.execute(
        "UPDATE menu_items SET restaurant_id = %s WHERE restaurant_id IS NULL",
        (RESTAURANT_ID,),
    )
    backfilled = cur.rowcount
    if backfilled:
        print(f"Backfilled restaurant_id on {backfilled} menu_items rows")

    # Build a lookup: petpooja external_id → internal menu_items UUID
    cur.execute(
        "SELECT e.external_id, e.internal_item_id FROM external_id_mapping e WHERE e.provider = %s",
        (PROVIDER,),
    )
    ext_to_uuid: dict[str, str] = {row[0]: str(row[1]) for row in cur.fetchall()}

    inserted = 0
    not_found: list[str] = []

    for alias_text, json_item_id in aliases.items():
        item_uuid = ext_to_uuid.get(json_item_id)
        if item_uuid is None:
            not_found.append(f"{alias_text!r} → {json_item_id!r} (not in menu_items)")
            continue

        cur.execute(
            """
            INSERT INTO menu_item_aliases (restaurant_id, item_id, alias)
            VALUES (%s, %s, %s)
            ON CONFLICT (restaurant_id, alias) DO NOTHING
            """,
            (RESTAURANT_ID, item_uuid, alias_text),
        )
        inserted += cur.rowcount

    conn.commit()
    cur.close()
    conn.close()

    already_existed = len(aliases) - len(not_found) - inserted
    print(f"\nResults:")
    print(f"  Aliases inserted        : {inserted}")
    if already_existed:
        print(f"  Already present (skipped): {already_existed}")
    print(f"  Not found in menu_items : {len(not_found)}")
    if not_found:
        print("\nNot found (likely variant-group aliases — no menu_items row for the group):")
        for msg in not_found:
            print(f"  - {msg}")
    print("\nDone.")


if __name__ == "__main__":
    main()
