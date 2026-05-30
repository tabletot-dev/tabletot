# KOT ↔ Order Lifecycle Fixes

Observations surfaced during review of `Kitchen.tsx`, `Orders.tsx`, `Billing.tsx`,
`BillView.tsx`, `orderSubmission.ts`, and `Index.tsx`.

Five root problems:
1. KOT and Order status changes don't cross-talk
2. KOT status vocabulary is ambiguous
3. Order status has kitchen states that belong to KOT
4. Bill finalization has no lock — kiosk can mutate the total while POS is settling
5. Kiosk self-closes the session before POS confirms payment

---

## Fix A — KOT → Order cross-talk (DB trigger)

**File:** new migration (next after current highest)

Add a Postgres trigger on `kot_tickets` that propagates status changes up to `orders`:

| KOT event | Orders effect |
|-----------|---------------|
| Any KOT for an order moves to `preparing` | Set `orders.status = 'preparing'` (only if current status is `new`) |
| All KOTs for an order reach `ready` | Set `orders.status = 'ready'` |
| KOT moves to `archived` (see Fix B2) | No order-level effect |

Trigger fires on `UPDATE` of `kot_tickets.status`. It reads all sibling KOTs for the
same `order_id` to determine the aggregate state before writing to `orders`.

This makes the Kitchen display the single source of truth for kitchen-side order state.
POS operators no longer need to manually mirror it in the Orders page.

---

## Fix B — KOT status vocabulary

### B1 — Rename `pending` → `accepted` on KOT

**Files:** new migration (column check constraint), `apps/pos/src/pages/Kitchen.tsx`

`pending` is kiosk-facing language ("I sent this"). `accepted` is kitchen-facing ("I've
seen it and I'm handling it"). The "Start Preparing" button in Kitchen.tsx becomes the
accept action; its `updateStatus(id, 'preparing')` call changes to
`updateStatus(id, 'accepted')` first, then a second button advances to `preparing`.

Alternatively — and simpler — collapse accept + start-preparing into one button that
sets `accepted` momentarily then `preparing`. The intent is that the kitchen display
distinguishes "not yet touched" from "in progress."

Migration must also update the `fetchTickets` query filter from
`['pending', 'preparing', 'ready']` to `['accepted', 'preparing', 'ready']`, and the
INSERT in `orderSubmission.ts` and `Billing.tsx:handleSendToKitchen` from
`status: 'pending'` to `status: 'accepted'`. The Realtime filter in Kitchen.tsx
`filter: 'status=eq.pending'` also needs updating.

### B2 — Replace `completed` with `archived` on KOT

**Files:** new migration, `apps/pos/src/pages/Kitchen.tsx`

KOT `completed` currently means "archived off the kitchen screen." That is confusing
because `orders.status = 'completed'` means something different (post-service). Rename
to `archived`. When the POS settles a bill (`handlePaymentComplete` in `Billing.tsx`),
add a bulk `UPDATE kot_tickets SET status = 'archived' WHERE order_id = <id>` call.
KOT lifecycle ends at `ready`; `archived` is just removal from the active queue.

---

## Fix C — Order status ownership

### C1 — Remove kitchen states from the Orders page dropdown

**File:** `apps/pos/src/pages/Orders.tsx`

Remove `preparing` and `ready` from the `<Select>` options in `Orders.tsx:194-202`.
These states are now driven by the KOT trigger (Fix A). Replace them with a read-only
badge so the POS can see the kitchen state but not manually override it.

Manual options available to POS: `new` (read-only on arrival), `served`, `completed`,
`paid`, `cancelled`.

### C2 — Fix kiosk order insert status

**File:** `apps/kiosk/src/lib/orderSubmission.ts`

The kiosk inserts new orders with `status: 'pending'` (`orderSubmission.ts:150`) but the
POS color map in `Orders.tsx:getStatusColor` handles `'new'` not `'pending'`. Change the
kiosk insert to `status: 'new'`. Confirm the `orders` table check constraint (if any)
allows `'new'`.

---

## Fix D — Bill finalization / locking

### D1 — Add `bill_generated_at` to `orders`

**File:** new migration

```sql
ALTER TABLE orders ADD COLUMN bill_generated_at timestamptz;
ALTER TABLE orders ADD COLUMN final_discount numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN final_total numeric;
```

When the POS captain taps "Generate Bill" in `Billing.tsx`, write these three fields.
This is the explicit "bill is locked" signal.

### D2 — Block kiosk submissions after bill is requested

**Files:** `apps/kiosk/src/lib/orderSubmission.ts`, `apps/kiosk/src/components/screens/BillView.tsx`

In `submitOrder()`, before inserting a new KOT, check the current session status:

```ts
const { data: session } = await supabase
  .from('sessions')
  .select('status')
  .eq('session_key', sessionKey)
  .single();

if (session?.status === 'bill_requested' || session?.status === 'closed') {
  throw new OrderSubmissionError('session', 'Bill has been requested — ordering is closed.');
}
```

Surface this to the customer as "Your bill is being prepared, ordering is closed for
this table." on the CartView confirm button.

### D3 — Persist discount + final total to `orders` on bill generation

**File:** `apps/pos/src/pages/Billing.tsx`

`discountAmount` is currently ephemeral React state — lost if the captain closes the
tab. When the captain taps "Generate Bill" (opening the bill preview), write
`discount_amount` and `final_total` back to the `orders` row. On re-opening the billing
panel for the same order, pre-populate `discountAmount` from `activeOrder.final_discount`
instead of defaulting to 0.

---

## Fix E — Kiosk session reset: wait for POS signal

### E1 — Remove the 5-second self-close timer in BillView

**File:** `apps/kiosk/src/components/screens/BillView.tsx`

Delete the `useEffect` at `BillView.tsx:30-34` that calls `onClose` after 5000ms. The
kiosk should not close its own session after submitting a bill request. Session closure
must come from the POS via the Realtime subscription.

The "sent" stage UI copy already says "This screen will reset shortly" — change it to
"A server will bring the bill to your table." and remove the countdown implication.

### E2 — Remove session.close() from kiosk BillView onClose

**File:** `apps/kiosk/src/pages/Index.tsx`

The `onClose` handler for the `bill-summary` screen at `Index.tsx:446-458` currently
calls `sessions.update({ status: 'closed' })` itself. Remove this. The kiosk must never
close its own session — that authority belongs to the POS only.

### E3 — Add a "payment confirmed" closing message on the kiosk

**File:** `apps/kiosk/src/pages/Index.tsx`

The existing Realtime subscription at `Index.tsx:81-103` already watches for
`sessions.status = 'closed'` and calls `endSession()` immediately. Extend it to show a
brief "Thank you! Payment confirmed — see you again." screen for ~3 seconds before
calling `endSession()`, so the customer gets explicit closure feedback rather than an
abrupt blank/idle screen.

---

## Implementation order (suggested)

1. **Migrations first** — D1 (bill_generated_at), then B1+B2 (KOT status rename),
   then A1 (trigger). Migrations are the foundation everything else depends on.
2. **Backend/trigger** — A1 trigger logic.
3. **Kitchen.tsx** — B1, B2 status vocab changes.
4. **Orders.tsx** — C1 dropdown cleanup.
5. **orderSubmission.ts** — C2 status fix, D2 session guard.
6. **Billing.tsx** — D1 write bill_generated_at, D3 persist discount.
7. **BillView.tsx** — E1 remove timer.
8. **Index.tsx** — E2 remove self-close, E3 add closing message.

Each step is independently testable. Do not proceed to the next until the previous is
manually verified against the pilot DB.
