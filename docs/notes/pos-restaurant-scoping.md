# POS must scope writes by `restaurant_id`

**Date:** 2026-05-30
**Affects:** `apps/pos/` writes to tenant-scoped tables (starting with `restaurant_tables`)
**Related:** `pos-table-diagnosis.md`, `restaurants-table-and-scoping.md`, `restaurant-id-query-audit.md`, migration `0033_default_restaurant_id_for_tables.sql`

## The bug

Creating a table in the POS **Table Management** screen made it invisible to the
kiosk, which failed with:

> `406 (Not Acceptable) — Cannot coerce the result to a single JSON object`

### Chain of causation

1. `restaurant_id` was added to `restaurant_tables` in `0007` as a **nullable
   column with no default**.
2. The POS insert (`TableManagement.tsx`) only sent `table_number`, `capacity`,
   `status`, `area_id` — so new rows landed with `restaurant_id = NULL`.
3. The kiosk resolves its table with a restaurant-scoped `.single()` query
   (`apps/kiosk/src/lib/orderSubmission.ts` → `resolveTableId`):
   ```ts
   .eq('restaurant_id', RESTAURANT_ID)
   .eq('table_number', TABLE_NUMBER)
   .single()
   ```
4. A `NULL`-scoped row never matches → zero rows → PostgREST's `.single()`
   returns 406 ("cannot coerce ... to a single JSON object", which it throws
   whenever the match count is not exactly 1).

## The fix (two layers)

**1. Database safety net — migration `0033`.** Sets a column `DEFAULT` to
Silver's pinned UUID and backfills existing `NULL` rows. This unblocks the
pilot immediately and catches any future insert that forgets to scope.

**2. Application correctness — POS sets it explicitly.** The default must never
be load-bearing: a hard-coded single-tenant default silently mislabels every
table the moment a second restaurant's POS runs against the same DB. So the POS
now sends `restaurant_id` on insert:

- `apps/pos/src/lib/restaurant.ts` — exports `RESTAURANT_ID` from
  `VITE_RESTAURANT_ID` (mirrors the kiosk), and warns loudly if unset.
- `TableManagement.tsx` insert: `.insert({ ...tableData, restaurant_id: RESTAURANT_ID })`.
- `apps/pos/.env.example` and `.env.local` now carry `VITE_RESTAURANT_ID`
  (local = `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91`, Silver's UUID pinned in `0014`).

## Convention going forward

**Any POS write to a tenant-scoped table must set `restaurant_id` explicitly
from `@/lib/restaurant`.** Do not lean on the DB column default — it exists only
as a backstop for the pilot's single tenant.

`pos-table-diagnosis.md` lists every POS file that writes to a scoped table
(`orders`, `kot_tickets`, `restaurant_tables`, etc.). Those INSERT payloads
should each be audited for an explicit `restaurant_id` before a second tenant is
onboarded. Only `restaurant_tables` is fixed so far.

### Caveat on the `0033` backfill

`UPDATE ... WHERE restaurant_id IS NULL` is tenant-blind — it assigns *all* NULL
tables to Silver. Harmless in the Silver-only pilot, but if Roast CCx (see
`0027`) ever created tables through the same broken path, they'd be reassigned.
Worth knowing if NULL rows reappear from another source.
