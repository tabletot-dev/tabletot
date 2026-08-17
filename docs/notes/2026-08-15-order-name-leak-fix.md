# Order-name leak across a cancelled round, fixed (2026-08-15)

Fixes finding #1 in `docs/notes/kiosk-pos-live-qa-findings.md`: typing a guest
name then cancelling that round left the name input hidden on the next round
(no way to see or edit it) while the stale name still got attached to
whatever order eventually shipped.

## Root cause

Identity (`tt_display_name` / `tt_identity_resolved` in `sessionStorage`, plus
a write to the `sessions` table) was persisted the instant "Send to kitchen"
was tapped, in `handleConfirmOrder` (`apps/kiosk/src/pages/Index.tsx`). But
the round itself is only a cancelable 2-minute hold
(`apps/kiosk/src/lib/pendingRound.ts` — "a cancelled round never existed").
`hold.cancelHold()` rolled back the cart but never touched identity, so:

- `tt_identity_resolved` stayed `true` → `showNameField` (gated on
  `!isIdentityResolved()`) went `false` on the next round → the field
  silently stopped rendering.
- `tt_display_name` stayed at the old value → `submitOrder()` read it
  unconditionally on the next real submission → the old name shipped.

## Fix

Moved identity persistence out of the tap-time handler and into the hold's
actual-submit path — the only place a round is irreversible:

- `apps/kiosk/src/lib/pendingRound.ts`: `PendingRound` gained an optional
  `displayName` field.
- `apps/kiosk/src/hooks/useRoundHold.ts`: `startHold(items, displayName?)`
  stashes it; `extendHold` carries it forward unchanged; every path that
  fires `onExpire` (natural expiry, `sendNow`, and the reload-recovery path)
  now passes `(items, displayName)` through.
- `apps/kiosk/src/pages/Index.tsx`: `handleConfirmOrder` no longer writes
  identity — it stashes `displayName` in `pendingDisplayNameRef` (so it
  survives the completion-nudge interstitial) and passes it to
  `hold.startHold`. The `setSessionDisplayName`/`markIdentityResolved` calls
  moved into the hold's `onExpire` callback, right before `confirmOrder()`.

Cancelling now discards the whole round — cart and identity together — so
the next round re-prompts for a name exactly as if nothing had happened.

## Verification

- Automated: `apps/kiosk/src/hooks/__tests__/useRoundHold.test.ts` (new) —
  asserts `displayName` reaches `onExpire` on natural expiry and `sendNow`,
  and never fires at all on `cancelHold`. `npx vitest run` — 20/20 passing.
  `tsc --noEmit` clean.
- Live browser repro (local kiosk dev server + local Supabase, Table T1):
  typed "TestGuestOne", sent to kitchen, confirmed `sessionStorage` held it
  only inside `tt_pending_round` (not `tt_display_name`), cancelled the
  round, confirmed `sessionStorage` fully clean. Added a new item — the
  "Name for this order" field rendered again (previously stayed hidden).
  Typed "TestGuestTwo", sent to kitchen, used Send Now. WaitingView showed
  "Your order is being prepared, TestGuestTwo" — no trace of the cancelled
  round's name.
