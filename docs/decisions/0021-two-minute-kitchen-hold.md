---
status: accepted
date: 2026-08-08
tags: [kiosk, ordering, aov]
---

# 0021 — Client-side 2-minute hold before a round reaches the kitchen

## Context

The v1.0 kiosk redesign (`docs/plans/2026-08-08-kiosk-v1-redesign.md`, Sprint 4)
adds a cancellable window after a guest presses "Send to kitchen." Before this
change, pressing Confirm called `submitOrder()` immediately: the round was
written to the ledger, a KOT ticket appeared, and there was no way for the
guest to change their mind short of asking a server.

Two constraints shaped the design:

1. **`get_aov_summary` (migration 0050) reads `direct_revenue` from
   `item_added` events whose `payload->>'source'` is `pairing_chip` or
   `completion_nudge`, filtered to items that survive into the final
   `items_json`.** Any hold mechanism that touches the ledger before the
   guest's decision is final risks writing rows for a round that gets
   cancelled, corrupting that number or requiring a matching migration to
   filter them back out.
2. **The kitchen needs the round the moment it's real.** A hold that lives
   only in server state (a `held` flag on a KOT row, for instance) is more
   robust to a killed tab, but it means writing to the ledger on "Send to
   kitchen" and then possibly un-writing it on cancel — exactly the ledger
   churn constraint 1 rules out for a first cut.

## Decision

The 2-minute hold is client-side only, held in `sessionStorage`
(`src/lib/pendingRound.ts`), not the ledger. Pressing "Send to kitchen"
does not call `submitOrder`. It starts a countdown (`useRoundHold`); the
kitchen submission (`confirmOrder`, which wraps `submitOrder`) runs only
when the countdown expires naturally or the guest presses "Send now."
Cancelling clears the pending round and the cart — the round never existed
as far as the ledger is concerned.

Concretely:
- `HOLD_DURATION_MS = 120_000`, not configurable per restaurant for the
  pilot.
- A device reload mid-hold restores the countdown from `sessionStorage`
  if the deadline hasn't passed; if it has (device was off long enough),
  the round is submitted immediately on the next load rather than
  discarded — a late round is a recoverable problem, a lost one is not.
- The `StatusStrip` (docked, visible from every screen) keeps a running
  hold visible even if the guest wanders off to Games or Menu, so the
  countdown is never silently ticking somewhere off-screen.

## Alternatives considered

- **Server-side hold (a `held` boolean on the KOT row, cleared by a cron
  or on expiry).** More resilient to a killed browser tab or reload, but
  requires a migration and a scheduled job for a pilot-stage feature, and
  reintroduces the "write now, maybe un-write later" ledger risk that
  direct-attribution AOV reporting (ADR 0015) specifically avoids.
  Revisit if the hold window ever needs to survive a full device
  power-cycle, which 2 minutes practically never will.
- **No hold at all — a confirmation dialog instead.** Rejected by the
  design brief: a modal "are you sure?" doesn't let a guest add one more
  item after tapping Send, which the countdown does (via "Edit round").
- **Hold indefinitely until explicit Send.** Rejected — it removes the
  main forcing function (the kitchen doesn't start until *something*
  happens) and turns "Send to kitchen" into a no-op label, which is
  confusing.

## Consequences

- `direct_revenue` stays correct with zero server-side changes: a
  cancelled round produces no ledger rows, so there's nothing to filter.
- The exposure window is real but bounded: a kiosk that crashes or loses
  power in the 2 minutes between "Send to kitchen" and kitchen delivery
  loses that round silently, with the guest sitting in front of a visible
  countdown the whole time (the failure is at least legible, if not
  automatically recovered in that specific case).
- Adding an item via "Order more" while a hold is active does **not**
  currently call `extendHold()` — the countdown keeps running on the
  original snapshot, and the `SentView` item count can understate what
  actually gets submitted at expiry (the live cart, not the snapshot, is
  what's sent). `extendHold` exists on the hook for exactly this case;
  wiring it into `handleAddToOrder`/`handleUpdateQuantity` is a follow-up,
  not done here to match the redesign plan's own scope for this sprint.
- If the hold window ever needs to exceed ~5 minutes, or survive a full
  power-cycle rather than just a reload, move it server-side behind a
  held-KOT flag instead — noted as a `ponytail:` comment in
  `pendingRound.ts`.
