# Changelog — POS App

Restaurant management app: KOT display, order management, billing, tables.

---

## [Unreleased]

### Changed

- **Menu editing moved to the dashboard** (ADR 0025) — `pages/Menu.tsx` and the unrouted `pages/AdminMenuItems.tsx` are deleted. New **Sold out** page (`pages/SoldOut.tsx`, `/sold-out`, all roles): one on/off switch per dish (`menu_items.active`), refreshes the voice engine's menu. `/menu` redirects there.


### Fixed

- **Settings never saved** — `pages/Settings.tsx` used `upsert(onConflict: 'key')`, which fails because the unique index on `restaurant_settings.key` is partial (`WHERE restaurant_id IS NULL`). Now update-then-insert per key.

- **Stale sessions and unresolved `bill_requested` rows** — root cause was on the kiosk side (see kiosk CHANGELOG). No POS code changed; `handleCleanupStaleSessions` and the billing close paths in `Billing.tsx` are unchanged and remain correct as the authoritative close path from the staff side.

---

## [0.4.0] — 2026-05-25

Major refactor. POS is now the GUI for the database — two access levels (staff, manager, admin), eight pages, session-aware billing, and direct Realtime synchronisation with the kiosk.

### Added

- **Sessions table** (`supabase/migrations/0019`) — `sessions` table anchors every customer visit. Three DB triggers: session INSERT → table occupied; session UPDATE (closed) → table free; orders INSERT → `current_order_id` set on table. See ADR 0010.
- **Bill requests + table requests** (`supabase/migrations/0017`) — `bill_requests` and `table_requests` tables with Realtime enrollment. Kiosk bill and water requests land here and surface as alert badges on the POS table grid.
- **Restaurant settings** (`supabase/migrations/0017`) — `restaurant_settings` key-value table. Seeded with `gst_rate = 5`, `currency_symbol = ₹`, `restaurant_name`. POS Settings page reads and writes this table.
- **Voice turns table** (`supabase/migrations/0020`) — `voice_turns` records resolved and unresolved phrases per voice turn for recommendation analytics. No raw transcripts stored (DPDP compliance).

- **Billing page — full rewrite** (`src/pages/Billing.tsx`) — two-panel layout replacing the three previous overlapping billing flows (`Billing.tsx`, `POSBilling.tsx`, `POSLayout.tsx`). Left panel: table grid with Realtime status, alert badges (bill requested, water requested), captain name. Right panel: order state machine — no order → start; active order → items list, Add Items, Generate Bill, Settle, End Service. Session-aware: loads order via `table.current_order_id` with fallback to `sessions` query for kiosk-originated orders. `handlePaymentComplete` closes the session, which resets the kiosk screen via Realtime.
- **Add Items modal** — two-panel dialog: left `MenuGrid` (full with category tabs + `ItemVariantModal`), right pending cart with per-round quantity controls. "Send to Kitchen" creates a new `kot_tickets` row for each round; updates `orders.items_json` in-place rather than inserting a new row.
- **Generate Bill modal** — itemised bill preview with inline discount field (₹). Discount written to `orders.discount` at settle time.
- **End Service button** — staff can close a session without payment (e.g. cash paid at counter). Updates `sessions.status = 'closed'`; triggers kiosk screen reset via Realtime.
- **Role-gated navigation** (`src/components/AppSidebar.tsx`) — three groups: Operations (Billing, Kitchen, Orders — all roles), Management (Tables, Reports — manager+admin), Admin (Menu, Staff, Settings — admin only). Role badge in the sidebar footer. Kitchen was missing from nav; now added.

- **Settings page wired** (`src/pages/Settings.tsx`) — reads from `restaurant_settings` on mount, saves via upsert. Fields: restaurant name, GST rate, currency symbol. Changes propagate to Billing's GST calculation on next load.
- **Reports page — fixed data source** (`src/pages/Reports.tsx`) — was reading from `orders` (empty after payment, data is archived to `order_history`). Now reads from `order_history`. Three tabs: Summary (revenue, orders, AOV, top items, daily sales), History (paginated completed orders), Day Close (open orders list, payment method breakdown, bulk-close button).
- **Staff page — POS login role** (`src/pages/StaffManagement.tsx`) — new "POS Login Role" column reads from `user_roles` table. Select dropdown (Staff/Manager/Admin) upserts to `user_roles` immediately. Admin can promote a staff member's POS access without leaving the page.
- **Menu page — image URL + currency** (`src/pages/Menu.tsx`) — `image_url` field added to add/edit form. Price label corrected from `$` to `₹`. After every save, fires `POST /admin/refresh-menu` to the voice engine so price/active changes propagate immediately without waiting for the 5-minute background cycle.

### Changed

- **Routing** — `/pos`, `/pos-billing` routes removed. `/` redirects to `/billing`. `allowedRoles` tightened: Tables/Reports → manager+admin; Menu/Staff/Settings → admin only.
- **`ProtectedRoute`** (`src/components/ProtectedRoute.tsx`) — access denied state now includes a "Back to Billing" button.
- **Kitchen page** (`src/pages/Kitchen.tsx`) — UPDATE Realtime handler changed from full re-fetch to optimistic state update. `updateStatus` no longer calls `fetchTickets()` — the Realtime handler and DB trigger handle propagation.
- **Orders page** (`src/pages/Orders.tsx`) — `syncFromSheets` function, 10-second polling interval, and "Sync Tabletot" button removed. Page is now purely Realtime-driven. Currency fixed from `$` to `₹`.
- **`TableSelector` component** (`src/components/billing/TableSelector.tsx`) — Google Sheets sync removed. Realtime subscription and `syncTableStatusFromOrders` kept.

### Removed

- **`POS.tsx`**, **`POSBilling.tsx`**, **`POSLayout.tsx`** — three overlapping billing UIs consolidated into the new `Billing.tsx`.
- **`Dashboard.tsx`** — replaced by redirect to `/billing`.
- **`AdminMenuItems.tsx`**, **`AdminCategories.tsx`** — routes `/admin/categories` and `/admin/menu-items` retired; functionality now in `/menu`.
- **All Google Sheets Edge Function calls** — `sync-orders-from-sheets`, `sync-order-to-sheets`, `sync-tables-from-sheets`, `update-order-status-sheet` invocations removed from `Orders.tsx`, `Billing.tsx`, `TableSelector.tsx`, `PaymentModal.tsx`. No Edge Functions are deployed; these calls were silently failing on every page load.

### Fixed

- **Reports showing zero data** — `Reports.tsx` queried `orders WHERE status='completed'`, but completed orders are archived to `order_history` and deleted. Reports now reads from `order_history`.
- **Discount never persisted** — discount was held in `CartSummary` local state and never written to the DB. Discount is now applied at settle time and written to `orders.discount` before archiving.
- **Duplicate payment flows leaving DB in different shapes** — `PaymentModal` (archived + deleted orders row) and `SettleBillModal` (updated status in-place) coexisted. Consolidated to `PaymentModal` path only.

---

## [0.3.0] — 2026-04-30

### Added

- **Menu management page** (`src/pages/Menu.tsx`) — view, add, edit, and soft-delete menu items directly in the POS. Writes to `menu_items` table; does not touch `external_id_mapping` (Petpooja adapter is post-pilot).
- **AOV lift readout** — cohort A/B measurement summary visible in the curation section. Calls `recommendation_aov_lift_cohort` DB function; shows treatment vs. control average order value and Welch's t-stat.

---

## [0.2.0] — 2026-04-29

### Added

- **Recommendation curation dashboard** (`src/pages/Curation.tsx`) — manage anchor items and item pairings used by the kiosk recommendation engine. Reads/writes `anchor_items` and `item_pairings` tables.
- **KOT Realtime subscription** — POS KOT view subscribes to `kot_tickets` via Supabase Realtime (`postgres_changes`); new tickets appear without polling.

### Changed

- **Schema rewrite** — migrated from a kiosk-shaped PoC schema to the POS-native schema (`orders`, `kot_tickets` with JSONB `items` column). `submitOrder()` rewritten to match. Types regenerated.
- **Migrations 0001–0006** — POS-native schema, internal canonical tables, Realtime enrollment for `orders` + `kot_tickets` + `menu_items`.

---

## [0.1.0] — 2026-04-29

### Added

- Initial POS PoC import — basic order list and KOT display.
- Supabase client wiring with local dev config.
