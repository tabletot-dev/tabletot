# POS-Only Live QA Findings (2026-08-13)

Follow-up to `docs/notes/kiosk-pos-live-qa-findings.md`, this pass is POS-only
via live browser automation against local Supabase + local POS (8081),
logged in as the admin test account. Focus: thorough walk of every POS
screen (Billing, Kitchen, Orders, Tables, Reports, Menu, Staff, Settings)
and identifying incomplete/unwired features. No code changed — findings
only.

**Test debris left behind, needs manual cleanup:** Table **T3**, menu item
**"QA Test Item"** (category `pastas `, note the trailing space), staff
member **"QA Test Staff"**, and one order on Table T1 now sitting in
`cancelled` status with a live bill still attached (see #1). Cleanup via
delete buttons will trigger the native `confirm()` freeze described in #4 —
plan for that.

## Critical

1. **Status: FIXED** (2026-08-15) in `apps/pos/src/pages/Billing.tsx` — see
   `docs/notes/2026-08-15-billing-cancelled-order-fix.md` for verification.
   Original finding kept below for context.

   **A cancelled order is still fully billable.** Cancelled a stuck test
   order via `/orders` (status dropdown → Cancelled). The Billing screen
   still shows it as Table T1's active bill afterward — full ₹410 total,
   live green "Settle" button, stale "Bill requested"/"Water requested"
   flags — with only a small "• cancelled" label under the table name as
   the sole indicator anything changed. A staff member who doesn't notice
   that label could charge a customer for a cancelled order. Likely needs
   `Billing.tsx`'s "current order for table" query to exclude `cancelled`
   status, not just select the latest/oldest unsettled row.

2. **Status: FIXED** in `supabase/migrations/0059_archive_kot_on_order_cancel.sql`
   (2026-08-15) — see `docs/notes/2026-08-15-kot-cancel-cascade-fix.md` for
   verification. Original finding kept below for context.

   **Cancelling an order doesn't cascade to its kitchen ticket.** Same
   repro: after cancelling via `/orders`, the linked KOT is still sitting
   in Kitchen Display as `ready`, uncompleted, indefinitely — kitchen staff
   would still see it as something to prepare/serve. This is the same
   subsystem `docs/notes/kot-order-lifecycle-fixes.md` addressed (KOT↔Order
   cross-talk trigger, migration 0035). Cancel-from-Orders looks like a gap
   in that fix's coverage, or a new code path added after it that never
   hooked into the trigger. Worth checking whether the
   `trg_sync_order_status_from_kot` trigger direction only covers
   KOT→Order, not Order(cancelled)→KOT.

3. **Staff Management doesn't create real logins — biggest gap found.**
   "Add Staff" modal only collects Name/Role/Phone, no email/password.
   `StaffManagement.tsx:131` generates a random placeholder `user_id` via
   `crypto.randomUUID()` with a comment admitting "we don't have a real auth
   user." The "POS Login Role" dropdown (Staff/Manager/Admin) updates with a
   success toast and looks like it's granting access control, but there's
   no real Supabase auth account behind the staff row — nobody could ever
   actually sign in as that staff member. Right now the single seeded admin
   login (`user@test.com`) is the only way into the POS at all; "Staff
   Management" is currently a contact roster, not a user-provisioning
   system. Needs either a real invite flow (email + Supabase auth user
   creation, or magic link) or the UI should stop implying login access is
   being configured.

4. **Status: FIXED** (2026-08-15) for the 4 live call sites — see
   `docs/notes/2026-08-15-confirm-dialog-fix.md` for verification. The 2 dead
   call sites (`AdminMenuItems.tsx`, `AdminCategories.tsx`) were left alone
   since they're unreachable (see #8). Original finding kept below for
   context.

   **Destructive actions use native `window.confirm()` dialogs, not the
   app's own modal.** Confirmed 6 call sites via grep: delete table
   (`TableManagement.tsx:138`), delete staff (`StaffManagement.tsx:155`),
   archive menu item (`AdminMenuItems.tsx:173` — dead code, see #8), delete
   menu item (`Menu.tsx:144`), End Service (`Billing.tsx:499`, uses
   `window.confirm` explicitly), delete category (`AdminCategories.tsx:127`
   — also dead code). This is inconsistent with the rest of the app's
   polished custom-modal design (e.g. kiosk's "Cancel this round?" modal).
   More importantly, it's not just cosmetic: it froze the automated browser
   session outright — native dialogs block all page script execution until
   dismissed, and recovery required a hard navigate/reload. Worth
   confirming this doesn't misbehave inside whatever webview/kiosk wrapper
   the tablet hardware eventually runs, and replacing with the app's
   existing modal component for consistency either way.

## Table status is two disconnected systems

5. **Table Management's Available/Occupied/Reserved/Cleaning status
   (`restaurant_tables.status`) is manual and untethered from real order
   state.** Table Management dashboard showed "0 Occupied" while Table T1
   had a live, unpaid, bill-requested order sitting in Billing. Manually
   setting a table to "Occupied" here doesn't block starting a fresh order
   on it (clicked into a manually-"Occupied" empty table, got a normal
   "Start Order" prompt), and it never updates automatically when a real
   order starts or settles. As implemented it's decorative — doesn't gate
   or reflect anything real. Either wire it to derive from live order
   state, or clarify in the UI that it's a manual front-of-house note
   (e.g. for "reserved"/"cleaning") independent of billing state.

6. **Status: INVESTIGATED, not reproducible (2026-08-15)** — see
   `docs/notes/2026-08-15-free-occupied-label-investigation.md`. Original
   finding kept below for context; no code changed.

   **Separately, the Billing sidebar's own Free/Occupied label is buggy.**
   A table whose order is specifically in `ready` status shows "Free" even
   with bill-requested and water-requested flags active on the same card
   (reproduced twice, consistently, immediately after POS login — not a
   one-off race condition). Orders in earlier stages (`new`/`cooking`)
   correctly showed "Occupied" in the prior QA session. Points at the
   Free/Occupied derivation in the Billing table-list component treating
   `ready` orders as if they don't count toward occupancy.

## Menu admin

7. **Status: FIXED** (2026-08-15) in `apps/pos/src/pages/Menu.tsx` — see
   `docs/notes/2026-08-15-category-normalization-fix.md` for verification.
   Original finding kept below for context.

   **Category is free text with zero normalization.** Added a menu item
   under `"pastas "` (lowercase, trailing space) alongside the existing
   `"Pastas"` category. Confirmed on the live kiosk menu: this created a
   second, visually separate category tab sitting right next to the
   original. One staff typo silently fragments the customer-facing menu
   into duplicate categories with no merge/dedupe path.

8. **The live Menu Management page (`Menu.tsx`, routed at `/menu`) is
   missing a veg/non-veg diet-tag field and a real category picker** —
   both already fully built, working, and *better* than what's live, in
   `AdminMenuItems.tsx` + `AdminCategories.tsx`. Confirmed via grep: these
   two files have zero references anywhere else in the codebase — not
   imported, not routed, fully dead code. `AdminMenuItems.tsx` specifically
   has a category filter built from actual distinct existing categories
   (can't fragment like #7) and a `tags` field for `"veg"` / `"non-veg,
   spicy"` classification. Someone built the more complete admin experience
   and it never got wired into `App.tsx`'s routing — worth deciding whether
   to swap `Menu.tsx` for these, or finish integrating them, rather than
   rebuilding the same functionality from scratch.

## Working well (for contrast)

- Reports (Summary / History / Day Close) matched actual order data
  exactly in every case checked — good integrity in the reporting layer
  itself, separate from the order-lifecycle issues above.
- Day Close deliberately has **no bulk "close day" action** — on-screen
  copy explains why: "Settle each from Billing — there is no bulk 'close
  day' action, so revenue and the kiosk state always stay in sync." A
  considered safeguard, not a missing feature.
- Table / Menu / Staff create-and-edit flows all work correctly and sync
  live across POS pages/tabs (verified table creation appearing instantly
  in Billing's table list, staff role changes persisting, etc).
