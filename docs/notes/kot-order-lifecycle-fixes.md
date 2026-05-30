# KOT ↔ Order Lifecycle Fixes

Observations surfaced during review of `Kitchen.tsx`, `Orders.tsx`, `Billing.tsx`,
`BillView.tsx`, `orderSubmission.ts`, and `Index.tsx`.

Six root problems (five original + one surfaced during implementation):
1. KOT and Order status changes don't cross-talk
2. KOT status vocabulary is ambiguous
3. Order status has kitchen states that belong to KOT
4. Bill finalization has no lock — kiosk can mutate the total while POS is settling
5. Kiosk self-closes the session before POS confirms payment
6. Bill re-request: `billRequested` was local WaitingView state, reset on navigation

**Status: all fixes implemented and deployed to local Supabase.**
Migrations 0034 + 0035 applied. Types regenerated for both apps.

---

## Fix A — KOT → Order cross-talk (DB trigger) ✓

**Migration:** `supabase/migrations/0035_kot_status_vocab_and_order_trigger.sql`

Postgres trigger `trg_sync_order_status_from_kot` on `UPDATE OF status` on `kot_tickets`:

| KOT event | Orders effect |
|-----------|---------------|
| Any KOT moves to `preparing` | Set `orders.status = 'preparing'` (only if currently `new`) |
| All active KOTs reach `ready` | Set `orders.status = 'ready'` |
| KOT moves to `archived` | No order-level effect |

Trigger uses `count(*) FILTER (WHERE status != 'archived')` to determine aggregate state.
Archived KOTs are excluded from the ready-check so post-payment archiving doesn't
interfere with order status.

---

## Fix B — KOT status vocabulary ✓

### B1 — Renamed `pending` → `accepted` on KOT

**Files:** `0035_kot_status_vocab_and_order_trigger.sql`, `apps/pos/src/pages/Kitchen.tsx`,
`apps/pos/src/pages/Billing.tsx`, `apps/kiosk/src/lib/orderSubmission.ts`

- Migration: `UPDATE kot_tickets SET status = 'accepted' WHERE status = 'pending'`;
  default changed to `'accepted'`
- Kitchen.tsx: Realtime INSERT filter `status=eq.accepted`, `fetchTickets` filter updated,
  filter tab renamed "New", card border and badge colours updated, `getStatusColor` updated
- Billing.tsx `handleSendToKitchen`: KOT INSERT uses `status: 'accepted'`
- orderSubmission.ts: KOT INSERT uses `status: 'accepted'`

Flow: KOTs are **inserted** as `accepted` (system received them) → kitchen taps
"Start Preparing" → `preparing` → "Mark Ready" → `ready` → "Complete & Archive" → `archived`.

### B2 — Replaced `completed` with `archived` on KOT ✓

**Files:** `0035_…`, `apps/pos/src/pages/Kitchen.tsx`, `apps/pos/src/pages/Billing.tsx`

- Migration: `UPDATE kot_tickets SET status = 'archived' WHERE status = 'completed'`
- Kitchen.tsx: Realtime UPDATE handler removes ticket from list when `status === 'archived'`;
  "Complete & Archive" button calls `updateStatus(id, 'archived')`
- Billing.tsx `handlePaymentComplete`: bulk-archives all KOTs for the order on payment:
  `UPDATE kot_tickets SET status = 'archived' WHERE order_id = <id> AND status IN ('accepted','preparing','ready')`
- Stale session cleanup guard in Billing.tsx updated from `['pending','in_progress']`
  to `['accepted','preparing','ready']`

---

## Fix C — Order status ownership ✓

### C1 — Removed kitchen states from the Orders page dropdown

**File:** `apps/pos/src/pages/Orders.tsx`

Removed `preparing` and `ready` `<SelectItem>` entries. These states are now driven
exclusively by the KOT trigger (Fix A). The current status badge in the Select trigger
still shows them for visibility; only POS-owned transitions remain selectable:
`new`, `served`, `completed`, `paid`, `cancelled`.

### C2 — Fixed kiosk order insert status ✓

**Files:** `apps/kiosk/src/lib/orderSubmission.ts`,
`supabase/migrations/0035_kot_status_vocab_and_order_trigger.sql`

- `orderSubmission.ts`: orders INSERT changed from `status: 'pending'` to `status: 'new'`
- Migration: one-time data fix `UPDATE orders SET status = 'new' WHERE status = 'pending'`

---

## Fix D — Bill finalization / locking ✓

### D1 — Added `bill_generated_at`, `final_discount`, `final_total` to `orders`

**Migration:** `supabase/migrations/0034_bill_lock_columns.sql`

```sql
ALTER TABLE orders
  ADD COLUMN bill_generated_at timestamptz,
  ADD COLUMN final_discount     numeric DEFAULT 0,
  ADD COLUMN final_total        numeric;
```

These are written when the POS captain clicks "Proceed to Settle" in the bill preview
dialog (not "Generate Bill" which just opens the preview — discount hasn't been set yet).

### D2 — Block kiosk submissions after bill is requested ✓

**File:** `apps/kiosk/src/lib/orderSubmission.ts`

Session guard added before the KOT INSERT in `submitOrder()`:

```ts
const { data: sessionRow } = await supabase
  .from('sessions').select('status').eq('session_key', sessionKey).single();
if (sessionRow?.status === 'bill_requested' || sessionRow?.status === 'closed') {
  throw new OrderSubmissionError('session', 'Bill has been requested — ordering is closed for this table.');
}
```

The `OrderSubmissionError` with step `'session'` is caught in `confirmOrder()` in
`useDeviceNavigation.ts` and surfaces via `alert()`. A follow-up UX pass could show
a friendlier inline message instead.

### D3 — Persist discount + final total on "Proceed to Settle" ✓

**File:** `apps/pos/src/pages/Billing.tsx`

- "Proceed to Settle" button now `await`s a write of `bill_generated_at`, `final_discount`,
  `final_total` to `orders` before opening the payment modal
- On table selection, a `useEffect` on `activeOrder.id` pre-populates `discountAmount`
  from `activeOrder.final_discount` if present (survives captain tab close + reopen)
- `Order` interface in Billing.tsx extended with the three new optional fields
- `as any` cast removed after types were regenerated

---

## Fix E — Kiosk session reset: wait for POS signal ✓

### E1 — Removed the 5-second self-close timer in BillView

**File:** `apps/kiosk/src/components/screens/BillView.tsx`

Deleted the `useEffect` that called `onClose` after 5000ms when `stage === 'sent'`.
Copy updated: "This screen will reset shortly" removed; only "A server will bring the
bill to your table." remains.

### E2 — Removed session.close() from kiosk BillView onClose ✓

**File:** `apps/kiosk/src/pages/Index.tsx`

The `onClose` handler for `bill-summary` no longer calls
`sessions.update({ status: 'closed' })`. The kiosk never closes its own session —
that authority belongs to the POS only.

### E3 — Added "payment confirmed" closing message on the kiosk ✓

**File:** `apps/kiosk/src/pages/Index.tsx`

The Realtime handler for `sessions.status = 'closed'` now:
1. Sets `paymentConfirmed = true` (renders a full-screen overlay: "Payment Confirmed /
   Thank you! / See you again soon.")
2. After 3 seconds, clears the overlay and calls `endSession()`

---

## Fix F — Bill re-request not blocked after navigation ✓

**Root cause surfaced during E1/E2 implementation.**

After the customer submitted a bill request (BillView `stage = 'sent'`), they could
tap "Order Status" in the AppHeader → navigate to `session-idle` → `WaitingView`
remounts with local `billRequested = false` → "Request Bill" button appears fresh →
customer navigates back to `bill-summary` → `BillView` remounts at `stage = 'summary'`
→ phone form visible again → second bill request submitted.

**Files:** `apps/kiosk/src/pages/Index.tsx`,
`apps/kiosk/src/components/screens/WaitingView.tsx`,
`apps/kiosk/src/components/screens/BillView.tsx`

**Fix:**
- `billRequested` lifted from WaitingView local state to `Index.tsx` (survives navigation)
- Resets automatically via `useEffect` when `currentScreen === 'idle'`
- `WaitingView` receives `billRequested` as a prop; button label stays "Bill Requested"
  even after navigating away and back
- `BillView` receives `alreadyRequested` prop; initialises `stage` to `'sent'` when true,
  so returning customers see the correct "bill is coming" screen, not the phone form
- `BillView` fires `onBillSubmitted()` callback after `setStage('sent')`;
  `Index.tsx` uses this to set `billRequested = true`

**Also fixed:** `KitchenStatus` type in `WaitingView.tsx` — removed dead `'pending'`
entry (orders are now `'new'`), added `'new'` → `{ label: "Queued", pct: 28 }`.

---

## What's still outstanding

- **D2 UX:** The `alert()` on blocked order submission is jarring. A follow-up should
  show an inline message in CartView when session is `bill_requested`.
- **C1 read-only badge:** The plan mentioned replacing kitchen states with a read-only
  badge in the Orders dropdown. Currently the trigger value shows them but they remain
  selectable if somehow set. Low priority — the trigger owns those transitions now.
- **Supabase types:** Regenerated for both apps after 0034 + 0035 were applied locally.
  Must re-run after applying to remote/staging.
