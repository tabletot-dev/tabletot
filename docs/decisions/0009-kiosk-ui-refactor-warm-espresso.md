---
id: "0009"
title: "Kiosk UI refactor — Warm Espresso design direction"
date: 2026-05-07
status: proposed
---

## Context

The kiosk app (`apps/kiosk`) was built incrementally during prototyping. The design
system exists in `tabletot.css` and `tabletot-redesign.css` but several gaps have
accumulated:

- `CATEGORY_GRADIENTS` is duplicated verbatim in `HomeView`, `CartView`, `DetailView`,
  and `WaitingView`.
- Buttons use a mix of class-based and inline-style colour overrides.
- The `ConfirmationView` success mark is a raw `✓` emoji rather than a styled element.
- The `DetailView` back link has no accessible label.
- No shared cart float exists — going from MenuView to CartView requires navigating
  via the header.
- `ListeningScreen` lacks a dismiss-on-outside-tap behaviour.

A design review was completed on 2026-05-07 using `/design-shotgun`. Variant A
("Warm Espresso") was approved as the canonical direction for all screens. The design
is documented in `docs/design-system.md`.

## Decision

Refactor the kiosk UI in two phases:

**Phase 1 — Shared foundations (no visual change)**

1. Extract `CATEGORY_GRADIENTS` to `src/lib/categoryGradients.ts` and import it in
   all four screens. Delete the four local copies.
2. Extract the `CompactCard` component (currently private to `WaitingView`) to
   `src/components/CompactCard.tsx` — it is needed in `DetailView` pairings too.
3. Add `src/lib/formatCurrency.ts` — single `₹` formatter used by all price displays.
4. Consolidate all `CATEGORY_GRADIENTS` usages to use the shared util.

**Phase 2 — Per-screen visual polish**

Apply the approved design spec from `docs/design-system.md` to each screen:

| Screen | Key changes |
|---|---|
| `HomeView` | Hero card: switch from gradient bg to `background-image` (food photo) once `image_url` is seeded. Utility cards: use `--radius-md` + border, remove inline styles. |
| `MenuView` | Add sticky cart float bar at canvas bottom when order is non-empty. Active category pill: ensure `--panel-dark` bg + white text matches approved spec. |
| `DetailView` | Photo panel: use `background-image` with gradient fallback (already structured for this). Pairing cards: navigate to item DetailView on tap rather than showing an add button. Add accessible `aria-label` to back link. |
| `CartView` | Order row thumbs: switch to `background-image` once `image_url` is seeded. Previous-order rounds: improve visual separation (divider + round label). |
| `ConfirmationView` | Replace `✓` emoji with a styled coral circle + checkmark SVG. |
| `WaitingView` | Progress bar: connect to real kitchen status when available (leave static 40% for pilot). Suggestion cards: use shared `CompactCard`. |
| `ListeningScreen` | Add dismiss-on-outside-tap. Pulse ring uses `--brand` colour from CSS var. |

**Out of scope for this refactor:**
- `BillView` — deferred (see project note on sessionTotal bug).
- Any new features or recommendation pattern changes.
- POS or dashboard apps.

## Consequences

- Phase 1 is safe to land at any time — purely mechanical, zero visual impact.
- Phase 2 changes are per-screen and can be shipped independently.
- After Phase 1, adding a new screen will only require importing from the shared utils,
  not copy-pasting constants.
- `image_url` seeding (migration 0011 + Unsplash placeholders) must happen before the
  photo-panel changes in Phase 2 look correct. The gradient fallback keeps things
  functional until then.
