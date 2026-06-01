# Petpooja Integration — Scope & Effort Estimate

_Written: 2026-06-01_

---

## Part 1 — Plain English

### What this is about

Tabletot is designed to sit on top of whatever POS a restaurant already uses. Petpooja is one of the most common POS systems in India. This document estimates the work required to make Tabletot work with a restaurant that runs Petpooja as their POS — meaning Petpooja handles their kitchen printers, billing, and payment records.

### Does this affect the Silver SSC pilot?

No. Silver SSC is currently using Tabletot's own built-in POS, not Petpooja. This integration only becomes relevant when Tabletot onboards a restaurant that is *already on Petpooja*. It is not blocking anything right now and should not be prioritised over the pilot.

### What does "integrating Petpooja" actually mean in practice?

When a customer orders through the Tabletot kiosk at a Petpooja restaurant, three things need to happen:

1. **The kitchen needs to know about the order.** Petpooja has its own kitchen printers. For those to fire, Tabletot has to push the order to Petpooja's system the moment the customer confirms. Without this, the kitchen never sees the order.

2. **The menu has to be in sync.** Tabletot needs to know every item, every size option (e.g. small/medium/large), and every add-on (e.g. extra cheese) — and crucially, the exact ID Petpooja uses internally for each one. If these IDs are wrong, the kitchen gets the wrong item.

3. **The bill has to come from Petpooja.** Petpooja calculates taxes, service charges, and discounts on their side. Tabletot needs to ask Petpooja to generate the bill, wait for it, and show the customer and staff the correct total. This can't be calculated independently on Tabletot's side, because Petpooja's numbers will differ.

### What's already built vs. what's missing?

The architecture was designed with Petpooja in mind — there's a placeholder in the database specifically for mapping Tabletot items to Petpooja IDs, and a field on each restaurant that says which POS they use. The intent was always to build this after the pilot. What's missing is the actual implementation: the ID mapping is empty, there's no menu sync tool, and no code yet sends orders to Petpooja or fetches bills from them.

### What are the real blockers?

The code itself is well-defined work. The actual blockers are:

- **Getting Petpooja API credentials.** You need a `app_key`, `app_secret`, and `access_token` from Petpooja to connect to their system. Depending on their partner onboarding process, this could take days to weeks.
- **Testing requires real hardware.** Confirming that kitchen printers fire correctly means physically being at a restaurant with a live Petpooja setup. You can't validate this in a browser.
- **A few product decisions need to be made before building.** Specifically: what happens if Petpooja's server is unreachable when a customer places an order? Does the order fail, or does Tabletot save it and retry? This matters operationally and needs an answer upfront.

---

## Part 2 — Technical Estimate

### Context

Tabletot uses its own canonical menu model (PostgreSQL via Supabase). Petpooja integration requires a two-way bridge: ingest Petpooja's menu format into Tabletot's schema, then push orders out to Petpooja's API at order time. The Petpooja DineIn API is fully documented in `docs/petpooja-dine-api.md`.

The integration touches 4 surfaces: database schema, a menu sync script, a KOT push adapter in the order flow, and an async billing bridge.

The Register Customer and Validate PIN APIs from Petpooja are not required — those are for the QR-code-on-table / customer phone flow. Tabletot is a kiosk; the table context is already established.

---

### Piece 1 — Schema: extend `external_id_mapping`

**What needs to change:**
`external_id_mapping` currently maps `menu_items.id → provider + external_id`. This is insufficient for Petpooja because:
- Variation options have their own Petpooja IDs (`variation[].id`, distinct from `variationid`)
- Addon items have their own IDs (`addonitemid`)
- Addon groups have their own IDs (`addongroupid`)
- None of the above can currently be stored

**Required changes:**
- Add `entity_type` column: `'item' | 'variation' | 'addon_item' | 'addon_group'`
- The existing `internal_item_id` FK to `menu_items` needs to become nullable (variations and addon items don't have a direct `menu_items` row)
- Add `internal_variant_id` (nullable FK to `item_variants`) and `internal_addon_id` (nullable FK to `item_addons`) so the mapping can target the right entity level
- Alternatively: a separate `petpooja_id_mapping` table scoped per entity type may be cleaner than extending the generic table

One new migration. No existing data is affected (the table is currently empty).

| | Estimate |
|---|---|
| Claude Code | 1–2 hrs |
| Human review | 30 min |

---

### Piece 2 — Menu sync script

**What it does:**
Calls Petpooja's `thirdparty_fetch_dinein_qr_menu` with a real `restID`, transforms the response into Tabletot's canonical schema, and upserts `menu_items`, `item_variants`, `item_addons`, and `external_id_mapping` in a single consistent pass.

**Shape of the transformation:**
- Petpooja `categories` → `menu_items.category` (flat text field in Tabletot)
- Petpooja `items[]` → `menu_items` rows, one per item (including `is_veg` from `item_attributeid`)
- Petpooja `items[].variation[]` → `item_variants` rows, linked to the parent `menu_items` row
- Petpooja `addongroups[].addongroupitems[]` → `item_addons` rows (the group itself is metadata, not a DB row)
- All Petpooja IDs → `external_id_mapping` rows with appropriate `entity_type`

**Edge cases that need decisions before building:**
- What to do when an item exists in Petpooja but has been deleted in Tabletot (or vice versa)
- Whether to sync `item_image_url` from Petpooja (currently nullable in Tabletot; Petpooja usually returns empty strings)
- How to handle Petpooja's `parent_category_id` / `group_category_id` hierarchy — Tabletot uses a flat category string, so this hierarchy is lost unless a mapping decision is made
- Whether the sync is manual (run once per restaurant setup) or scheduled (nightly cron)

**What cannot be tested without credentials:**
The transformation logic can be written and unit-tested against the sample payloads in `docs/petpooja-dine-api.md`. But end-to-end correctness — especially whether Petpooja's real menu data matches the documented shape for all edge cases — requires real credentials and a real restaurant.

| | Estimate |
|---|---|
| Claude Code | 3–5 hrs |
| Human: decisions + credential acquisition | 1–3 days (Petpooja partner onboarding unknown) |
| Human: test runs + data validation | 4–6 hrs across multiple sessions |

---

### Piece 3 — KOT push adapter (critical path)

**What it does:**
When a `kot_tickets` row is inserted (triggered by an order submission from the kiosk), the adapter:
1. Looks up Petpooja IDs for each item/variation/addon via `external_id_mapping`
2. Constructs the Petpooja KOT payload — including the `"Item Name (Variation Name)"` format for variation items and the JSON-encoded `AddonItem` string
3. POSTs to Petpooja's `save_kot_qr_order` endpoint
4. Records the result (`success`/`errorCode`) back on the `kot_tickets` row

**Implementation options:**
- A Supabase Edge Function triggered by the `kot_tickets` insert (keeps it serverless, no new service)
- A background job in the order-engine FastAPI service (more control, easier to add retry logic)
- A Postgres trigger calling `pg_net` (simplest, but least observable)

The Edge Function approach is preferred: it fits the existing Supabase-first architecture, is independently deployable, and keeps retry/error state in the database.

**Key complexity: variation item name format**
Petpooja requires `"Item Name (Variation Name)"` as the `name` field in KOT items (e.g. `"Americana Corn Pizza (Medium)"`). The `id` field must be the variation's `id` value (not `itemid`, not `variationid` — the third, different ID). This is easy to get wrong and silent on failure (wrong ID = wrong item printed, no error returned).

**Retry / failure handling — needs a decision:**
If Petpooja returns `success: "0"` or the network call fails, the options are:
- Block the order (kiosk shows error, customer can't complete) — safest but bad UX
- Accept the order into Tabletot and queue for retry — allows ordering to proceed but introduces eventual-consistency risk
- Accept and surface a staff alert in the POS app — hybrid

This decision must be made before implementation begins.

**What testing requires:**
A real Petpooja POS on a staging account, with a printer attached, at a restaurant. Can't be validated in a staging database alone.

| | Estimate |
|---|---|
| Claude Code | 4–6 hrs |
| Human: architecture decision (failure handling) | 1 hr |
| Human: integration testing with real hardware | 4–8 hrs |

---

### Piece 4 — Async billing bridge

**What needs to change:**

`bill_requests` currently stores a kiosk signal ("customer wants the bill") with `status: pending | acknowledged | settled`. Petpooja's billing is a 3-step async flow:
1. `POST /request_bill` → returns either `request_id` or `bill_request_id`
2. If `request_id`: poll `POST /check_bill` every ≥5 seconds until `bill_request_id` is non-zero
3. `POST /get_bill` with `bill_request_id` → returns full bill with `order_data` and `items_data`

**Schema changes needed:**
Add to `bill_requests`:
- `petpooja_request_id text` (from step 1 if polling is needed)
- `petpooja_bill_request_id text` (from step 1 directly, or step 2 after polling)
- `petpooja_bill_json jsonb` (full response from `get_bill`, for audit/display)

**Logic:**
A polling service (Edge Function or order-engine background task) fires when a `bill_requests` row enters a new `petpooja_pending` status. It runs the request → check → get flow and writes the result back. The POS app subscribes to the `bill_requests` row via Supabase Realtime and updates the bill display when `petpooja_bill_json` is populated.

**Number reconciliation:**
Petpooja's `order_data.total` will be the authoritative total (includes their tax/discount/packing charge logic). Tabletot's locally-calculated `orders.total` may differ slightly. The POS needs to display Petpooja's number once available. The `orders` table doesn't need to be rewritten — just display Petpooja's number in the bill view.

**`check_bill` semantics:**
- `bill_request_id = "0"` → not ready, retry in ≥5s
- `bill_request_id = "-1"` → no active KOTs on the table; surface error to staff
- `bill_request_id > "0"` → ready, call `get_bill`

| | Estimate |
|---|---|
| Claude Code | 2–4 hrs |
| Human: test timing / edge cases | 3–5 hrs |

---

### Piece 5 — Petpooja credentials config

`restaurant_settings` (key-value table, already exists) can store `petpooja_app_key`, `petpooja_app_secret`, `petpooja_access_token`, and `petpooja_rest_id` as per-restaurant rows. These should be treated as secrets — not exposed via RLS to anon clients.

| | Estimate |
|---|---|
| Claude Code | 30 min |
| Human | 15 min |

---

### Total

| Piece | Claude Code | Human time |
|---|---|---|
| Schema: extend ID mapping | 1–2 hrs | 30 min |
| Menu sync script | 3–5 hrs | 1–3 days (credentials) + 4–6 hrs (validation) |
| KOT push adapter | 4–6 hrs | 1 hr (decision) + 4–8 hrs (hardware testing) |
| Async billing bridge | 2–4 hrs | 3–5 hrs |
| Credentials config | 30 min | 15 min |
| Buffer (real-world surprises) | 3–5 hrs | 3–5 hrs |
| **Total** | **~14–22 hrs** | **~15–25 hrs + credential wait** |

### Calendar estimate

| Scenario | Calendar time |
|---|---|
| Petpooja credentials already in hand | 2–3 weeks part-time |
| Need to acquire credentials first | 4–6 weeks (mostly waiting on Petpooja) |

### Dependency order

These pieces cannot be done in parallel — each unlocks the next:

```
1. Schema fix
      ↓
2. Menu sync (needs schema; needs credentials to test)
      ↓
3. KOT push (needs populated external_id_mapping from step 2)
      ↓
4. Billing bridge (needs KOT push working first; end-to-end only testable together)
      ↓
5. Credentials config (can be done anytime, but obviously needed before any live testing)
```

### Open decisions required before starting

1. **Failure handling on KOT push:** block order, retry silently, or alert staff?
2. **Menu sync frequency:** one-time setup script, or scheduled sync to catch Petpooja menu updates?
3. **Category hierarchy:** Petpooja has parent categories and group categories; Tabletot stores a flat string. Decide on a mapping convention before the first sync.
4. **Which restaurants get Petpooja mode:** is this a per-restaurant flag, or does `pos_provider = 'petpooja'` on the `restaurants` table gate everything?
