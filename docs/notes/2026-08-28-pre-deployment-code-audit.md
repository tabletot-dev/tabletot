# Pre-Deployment Code Audit (2026-08-28)

Static, code-only audit of the three deployed apps — kiosk, POS, dashboard —
plus the shared Supabase layer they all sit on (ledger RPCs, `get_aov_summary`,
RLS/grants). Question asked: **will anything break when this goes onto a real
restaurant floor?** No code changed, no live DB queried, no device tested —
findings are from reading the code, migrations, and tests.

Scope note: the frozen voice pipeline internals were deliberately not
re-reviewed (`services/order-engine/CLAUDE.md`). Only its integration seams
(session boot, restaurant config load, `/voice/health`) were checked; they are
clean.

This is the systematic follow-up the 2026-08-13 readiness assessment asked for.
Its core warning — *"admin/POS-driven state changes hitting the event ledger
were never exercised"* — turned out to be right. Findings 1, 3, and 5 all live
in exactly that gap.

> **Update (2026-08-28, same day):** findings 1–8 are fixed, verified against
> a real Postgres 16 instance and/or the kiosk's test suite (no live Supabase
> project was available in this session either — see each commit for exactly
> how it was validated instead), and pushed to
> `claude/project-status-review-7w70cm`. Findings 9 and 10 are still open —
> see their sections below for current status. Re-read the "Bottom line"
> below as historical: it described the branch's state at audit time, not
> after these fixes.

## Bottom line (at audit time — see the update above)

**Not ready for the floor.** Three findings cause visible customer-facing
failure or real financial exposure. The architecture itself is sound — the
single-writer ledger, client-generated idempotency keys, and span discipline
are well built — and every defect below is a small local fix, not a redesign.

| # | Severity | Finding | Where | Status |
|---|---|---|---|---|
| 1 | P0 | Reload during the 2-min hold destroys the round, guest told "confirmed" | kiosk | **Fixed** — f3f4f7e |
| 2 | P0 | Public POS signup grants full write on orders, payments, menu | POS / DB | **Fixed** — 5070346, cd04489, 06b3af5 |
| 3 | P0 | Cancel-then-reorder resurrects cancelled items onto the bill | DB / POS | **Fixed** — a89957a |
| 4 | High | Cash overpayment inflates AOV revenue | POS / DB | **Fixed** — 48a6dbd |
| 5 | High | Items added during the hold are swept into the guest's already-shown round | kiosk | **Fixed** — e43fc44 |
| 6 | Medium | Table identity silently defaults to `T1` | kiosk | **Fixed** — 5878683 |
| 7 | Medium | GST rate defined in three places, one configurable | all | **Fixed** — d68bd9c |
| 8 | Medium | Failed table lookup makes the kiosk silently inert | kiosk | **Fixed** — b64c4c7 |
| 9 | Medium | `kiosk_events` is dead; CLAUDE.md documents it as live | DB / docs | **Partially fixed** — doc corrected same day (3424891); table itself still exists, undropped |
| 10 | Low | Mid-browse reload drops the guest to the idle screen | kiosk | Open |

---

## P0 — will break in the restaurant

### 1. A tablet reload during the 2-minute hold silently destroys the order and tells the guest it was confirmed

The most dangerous finding, because it fails *silently and positively*.

The hold's expiry callback (`apps/kiosk/src/pages/Index.tsx:87`) is declared
`async (_items, displayName)` — it ignores the restored items and calls
`confirmOrder()`, which submits `order` from `useDeviceNavigation`. But the
cart is never persisted: `useDeviceNavigation.ts:31` is a plain
`useState<OrderItem[]>([])`, and only `tt_pending_round`, `tt_display_name`,
and `tt_identity_resolved` are written to `sessionStorage`.

So after a reload `order` is `[]`, and `confirmOrder`
(`useDeviceNavigation.ts:75-97`) does:

```ts
if (order.length > 0) { ...submitOrder(order)... }
setCurrentScreen("order-confirmation");   // unconditional
```

**Failure sequence:** guest presses Send → tablet reloads or wakes from sleep
inside the 2-minute window → `useRoundHold`'s restore effect resumes the
countdown (`useRoundHold.ts:24-33`) → expiry fires → empty cart → no
`order_submitted` event, no KOT, no revenue → guest sees "Order Confirmed".
The kitchen never learns the order exists. Staff find out when the guest asks
where their food is.

On a *full* app restart `sessionStorage` is cleared, so `tt_pending_round` is
gone too: the round vanishes with no confirmation screen. Slightly less bad
(no false reassurance) but still a lost order the guest believes was placed.

`pendingRound.ts:8-11` explicitly reasons that "a reboot in that window is
recoverable and obvious." The storage half of that is true; the recovery path
drops the items.

**Why tests didn't catch it:** `hooks/__tests__/useRoundHold.test.ts:31,45`
asserts the hook calls `onExpire(items, "Priya")` — and the hook is correct.
The *consumer* discards the items. Isolated hook tests give false confidence
here.

**Fix:** use the `items` parameter the hook already passes — have
`confirmOrder` accept an explicit item list rather than closing over cart
state. Add a regression test that simulates remount-with-stored-round and
asserts `submitOrder` is called with the restored items.

### 2. Anyone with the POS URL can self-register and gain full write access to orders, payments, and menu prices

Four things compose into an open door:

1. `apps/pos/src/pages/Auth.tsx:88,123` — a public **Sign Up** tab on the
   login screen.
2. `supabase/migrations/0040_handle_new_user_trigger.sql:37` — the
   `handle_new_user()` trigger auto-inserts `user_roles = 'staff'` for every
   new `auth.users` row. No approval step.
3. `supabase/migrations/0022_rls_policies.sql:31-32,58-59,92` — policies are
   `staff_write ... FOR ALL TO authenticated USING (true) WITH CHECK (true)`
   across the operational tables. No restaurant scoping, no role check.
4. `supabase/migrations/0065_grant_anon_authenticated_table_access.sql:9` —
   blanket `GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO
   authenticated`, plus matching `ALTER DEFAULT PRIVILEGES`.

The POS is on a public Railway URL. A stranger who finds it can register in
seconds and then void orders, mark bills settled, or rewrite menu prices. For
a product whose entire pitch is trustworthy revenue numbers, this must close
before the tablet leaves the desk.

**Fix direction:** remove public signup (invite/admin-provisioned accounts
only); stop auto-granting `staff` in the trigger — default to a
no-privilege role pending approval; scope the write policies by
`restaurant_id` and role rather than `USING (true)`. Note that 0065's blanket
grant is load-bearing for local `db reset` (see its header comment), so
narrow it rather than simply dropping it.

### 3. Cancelling an order in POS, then ordering again, puts the cancelled items back on the bill

`table_state.order_id` is cleared **only** by `payment_settled` and
`service_ended` (`0063_settle_discount_and_kot_archive_sweep.sql:246,293`).
Nothing clears it on cancellation — `apps/pos/src/pages/Orders.tsx:141` simply
does `orders.update({ status: 'cancelled' })`, and the only cancel-side trigger
(`0060_kot_cancelled_status.sql`) touches `kot_tickets`, not `table_state`.

So the next `order_submitted` for that table sees `v_state.order_id IS NOT
NULL`, takes the merge branch (`0063:121-160`), merges the cancelled items with
the new ones, and resets `status = 'new'` (`0063:157`). The voided order is
resurrected with its items intact and the guest is charged for food that was
cancelled.

Secondary symptom that will make this baffling to debug live: between the
cancel and the next round, `Billing.loadActiveOrder` filters cancelled orders
out (`apps/pos/src/pages/Billing.tsx:367`), so the POS shows "no active order"
while the ledger still points squarely at it. The two views disagree.

**Fix:** clear `table_state.order_id` when an order is cancelled. Cleanest as a
trigger alongside the existing `archive_kot_on_order_cancel`, so it cannot be
bypassed by whichever client performs the cancel. Append as a new migration
(0066) — never edit 0060/0063.

---

## High — corrupts the number the pilot exists to prove

### 4. Cash overpayment inflates AOV revenue on every transaction with change

`apps/pos/src/components/billing/PaymentModal.tsx:41,71` sends `amount_paid`
as whatever the staff typed. The field is freely editable
(`PaymentModal.tsx:144-150`) and the modal renders a **"Change to Return"**
readout (`:167-174`), so tendering ₹500 against a ₹430 bill is the *designed*
flow, not misuse.

That value goes straight into `payments.amount`
(`0063:228-232`), and `get_aov_summary` v6 sums `payments.amount` as
`total_revenue` (`0062_get_aov_summary_v6_payments_sourced.sql:88-91`).

Every cash payment with change therefore overstates revenue by exactly the
change given — a systematic upward bias in a cash-heavy Indian restaurant, on
the single headline metric the pilot exists to validate. Ironically this is a
regression introduced *by* the v6 fix: sourcing from `payments.amount` cured
the stale-discount and walkout bugs but adopted "tendered" in place of
"charged".

**Fix:** record the bill total (post-discount) as `payments.amount` and keep
`amount_paid` purely for the change calculation — or add a distinct
`amount_due` column and have `get_aov_summary` sum that. Tips are already
correctly separated (`payments.tips`).

### 5. Items added during the hold are swept into the round the guest already saw

`useRoundHold.extendHold` (`apps/kiosk/src/hooks/useRoundHold.ts:64-71`) exists
precisely to restart the clock when an item is added mid-hold. **It is never
called anywhere** — confirmed by grep across the kiosk source.

During the hold the guest can tap "Order more" (`Index.tsx:523`) and add items,
which land in `order`. At expiry `confirmOrder()` submits the entire current
cart, not `hold.heldItems`. Meanwhile SentView is showing the guest
`hold.heldItems ?? order` (`Index.tsx:517`).

Result: the KOT that reaches the kitchen contains items the guest never
confirmed and never saw on the "sent" screen. Same root cause as finding 1 —
the submitted round is derived from live cart state rather than the captured
round.

**Fix:** falls out of finding 1's fix (submit the held items explicitly), plus
wiring `extendHold` where items are added while `hold.isHolding` is true.

---

## Medium — deployment and data-integrity risks

### 6. Table identity silently defaults to `T1`

`apps/kiosk/src/lib/config.ts:13-16` resolves table identity as
`?table=` → `VITE_TABLE_ID` → `'T1'`.

There is no web manifest anywhere in `apps/kiosk` (no `public/manifest.json`,
nothing referenced from `index.html`), so despite the "PWA" framing this runs
as an ordinary browser tab and the table identity lives entirely in the URL
query string. Any relaunch at the bare origin — a cleared tab, a bookmark
without the param, a kiosk-mode home page — silently makes that tablet **T1**
and starts writing into T1's live span. Orders land on the wrong table with no
error anywhere.

**Fix:** drop the `'T1'` fallback and fail loudly (blocking setup screen) when
no table is resolvable.

### 7. GST rate is defined in three places, only one of them configurable

- POS reads `restaurant_settings.gst_rate`, defaulting to 5
  (`Billing.tsx:199-205`, applied at `:194`).
- `append_event` hardcodes `0.05` (`0063:118,155`).
- The kiosk hardcodes `TAX_RATE = 0.05` (`apps/kiosk/src/lib/pricing.ts`).

Change the setting and the POS bill, the stored order total, and the kiosk's
displayed total diverge silently. Today all three agree at 5%, so this is
latent — but it is a money bug waiting on a config change.

**Fix:** single source of truth. Either read the rate from the DB in all three
places, or make the hardcode explicit and remove the settings key so it cannot
drift.

### 8. A failed table lookup makes the kiosk silently inert

`resolveTableId` throws on a missing table
(`apps/kiosk/src/lib/orderSubmission.ts:18`), but every caller swallows it:
`track()` only logs (`eventBus.ts:33`), and boot hydration does
`.catch(() => {})` twice (`Index.tsx:110,119`).

A misconfigured `VITE_RESTAURANT_ID`/`VITE_TABLE_ID` therefore produces a kiosk
that browses, adds to cart, and shows recommendations perfectly while recording
absolutely nothing. The failure only surfaces at "Send to kitchen".

**Fix:** surface an unresolvable table as a blocking setup error at boot rather
than a swallowed promise rejection. Pairs naturally with finding 6.

### 9. `kiosk_events` is dead, and CLAUDE.md documents it as live

Nothing writes or reads `kiosk_events`. The only references in the whole repo
are its own migration (`0041_kiosk_events_table.sql`) and the generated
`types.ts` files. Attribution actually flows through `table_events` via
`append_event` (`apps/kiosk/src/lib/eventBus.ts` → `ledger.ts:31`), which is
what `get_aov_summary` reads.

**Self-correction:** the CLAUDE.md refresh committed earlier today
(`3424891`) states that nudge attribution fires on `kiosk_events`. That is
wrong and would send a future debugging session down a blind alley. It should
say `table_events`. Flagged here rather than silently amended so the
correction is visible.

**Fix:** correct the CLAUDE.md line; decide whether to drop the dead table in a
new migration (as 0051 did for `recommendation_events`) or keep it reserved.

---

## Low — worth knowing, not blocking

### 10. Mid-browse reload drops the guest back to the idle screen

Boot hydration only restores when `state.state !== "idle" && state.rounds.length
> 0` (`Index.tsx:113`). A guest who has built a cart but not yet sent a round
loses it entirely on reload and lands on the attract screen mid-visit. Not
silently *wrong* — just a bad moment in front of a customer. Same underlying
cause as finding 1: the cart has no durable home.

### Realtime resilience — checked, mostly good

The kiosk treats Realtime as a poke with a 30s fallback poll plus a
`visibilitychange` refetch (`Index.tsx:205-220`), which is the right pattern
and correctly handles a missed settle. POS Billing polls idle signals every 60s
(`Billing.tsx:302`). Kitchen Display relies on a filtered subscription
(`Kitchen.tsx:66`, `status=eq.accepted` for inserts) with resubscribe handling
at `:99-104` — worth an explicit floor test with the venue's wifi, since a
dropped ticket there is a missed dish.

---

## Recommended order of work

1. **Finding 1** — one-line-shaped fix (use the passed items), plus a
   regression test that exercises remount-with-stored-round rather than the
   hook in isolation.
2. **Finding 2** — remove public signup, stop auto-granting `staff`, scope the
   write policies.
3. **Finding 3** — new migration clearing `table_state.order_id` on cancel.
4. **Finding 4** — before any AOV number is shown to the restaurant, since it
   biases upward silently rather than failing visibly.
5. Findings 5–8 — 6 and 8 are cheap and prevent genuinely confusing
   afternoons.

Findings 1, 3, and 5 are behavioral and **none are covered by the existing test
suite**. Regression tests should land with the fixes, not after.

## What this audit did not cover

- Live/device behavior: nothing was run. Hardware, network, and print-path
  behavior on the Tab K9 remain untested (still Rohan's manual pass).
- The frozen voice pipeline internals (seams only).
- Load/concurrency behavior under real multi-table traffic — the `FOR UPDATE`
  serialization in `append_event` looks correct by inspection, but has not been
  exercised under contention.
- Dashboard curation pages beyond `AovView` (low risk: read/write of curation
  rules only).
