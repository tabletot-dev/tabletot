#!/usr/bin/env python3
"""
Import Roast CCx menu from menus/roast-ccx-hyd.json into menu_items + external_id_mapping.

Usage:
    python scripts/import_menu.py

Reads DATABASE_URL from environment (falls back to local Supabase default).
Safe to re-run: uses ON CONFLICT DO NOTHING.
"""

import json
import os
import sys
import uuid
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# Load .env from order-engine directory (script may be run from repo root)
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ORDER_ENGINE_DIR = REPO_ROOT / "services" / "order-engine"
load_dotenv(ORDER_ENGINE_DIR / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
)

MENU_FILE = ORDER_ENGINE_DIR / "menus" / "roast-ccx-hyd.json"
PROVIDER = "petpooja"


def load_menu(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def build_rows(menu: dict) -> tuple[list[dict], list[dict], list[str]]:
    """
    Returns (menu_item_rows, mapping_rows, skipped_reasons).
    Each menu_item row: {id, name, category, price, active, tags}
    Each mapping row:   {internal_item_id, provider, external_id}
    """
    items_rows: list[dict] = []
    mapping_rows: list[dict] = []
    skipped: list[str] = []

    for item in menu.get("items", []):
        # Skip explicitly inactive items
        if item.get("active") is False:
            skipped.append(f"{item['id']}: active=false")
            continue

        item_type = item.get("type", "simple")

        if item_type == "simple":
            internal_id = str(uuid.uuid4())
            tags = item.get("tags", [])
            items_rows.append({
                "id": internal_id,
                "name": item["name"],
                "category": item.get("category"),
                "price": item.get("price"),
                "active": True,
                "tags": json.dumps(tags) if tags else None,
            })
            mapping_rows.append({
                "internal_item_id": internal_id,
                "provider": PROVIDER,
                "external_id": item["id"],
            })

        elif item_type == "variant_group":
            for variant in item.get("variants", []):
                internal_id = str(uuid.uuid4())
                # Compose full display name: "Belgian Waffle – Nutella & Banana"
                display_name = f"{item['name']} – {variant['name']}"
                tags = variant.get("tags", item.get("tags", []))
                items_rows.append({
                    "id": internal_id,
                    "name": display_name,
                    "category": item.get("category"),
                    "price": variant.get("price"),
                    "active": True,
                    "tags": json.dumps(tags) if tags else None,
                })
                mapping_rows.append({
                    "internal_item_id": internal_id,
                    "provider": PROVIDER,
                    "external_id": variant["id"],
                })

        else:
            skipped.append(f"{item['id']}: unknown type '{item_type}'")

    return items_rows, mapping_rows, skipped


def run_import(items_rows: list[dict], mapping_rows: list[dict]) -> tuple[int, int]:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    items_inserted = 0
    mappings_inserted = 0

    for row in items_rows:
        cur.execute(
            """
            INSERT INTO menu_items (id, name, category, price, active, tags)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (id) DO NOTHING
            """,
            (row["id"], row["name"], row["category"], row["price"], row["active"], row["tags"]),
        )
        items_inserted += cur.rowcount

    for row in mapping_rows:
        cur.execute(
            """
            INSERT INTO external_id_mapping (internal_item_id, provider, external_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (provider, external_id) DO NOTHING
            """,
            (row["internal_item_id"], row["provider"], row["external_id"]),
        )
        mappings_inserted += cur.rowcount

    conn.commit()
    cur.close()
    conn.close()

    return items_inserted, mappings_inserted


def main() -> None:
    if not MENU_FILE.exists():
        print(f"ERROR: Menu file not found: {MENU_FILE}", file=sys.stderr)
        sys.exit(1)

    menu = load_menu(MENU_FILE)
    items_rows, mapping_rows, skipped = build_rows(menu)

    total_processed = len(items_rows) + len(skipped)
    print(f"Menu file    : {MENU_FILE.relative_to(REPO_ROOT)}")
    print(f"Items parsed : {total_processed} (from {len(menu['items'])} top-level entries)")
    print(f"Rows to try  : {len(items_rows)} menu_items, {len(mapping_rows)} mappings")

    if skipped:
        print(f"\nSkipped ({len(skipped)}):")
        for reason in skipped:
            print(f"  - {reason}")

    print("\nConnecting to database...")
    try:
        items_inserted, mappings_inserted = run_import(items_rows, mapping_rows)
    except Exception as exc:
        print(f"ERROR during import: {exc}", file=sys.stderr)
        sys.exit(1)

    already_existed = len(items_rows) - items_inserted
    print(f"\nResults:")
    print(f"  menu_items inserted         : {items_inserted}")
    print(f"  external_id_mapping inserted: {mappings_inserted}")
    if already_existed:
        print(f"  rows already present (skipped by ON CONFLICT): {already_existed}")
    print("\nDone.")


if __name__ == "__main__":
    main()
