---
status: accepted
date: 2026-06-06
tags: [measurement, dashboard, pilot, attribution]
---

# 0018 — Upsell attribution is "added via recommendation + survived to submitted order"

## Context

ADR 0015 committed the pilot dashboard to direct-attribution rather than
cohort A/B testing. The v1 implementation (migration 0037) credited
revenue when a `recommendation_events` row had `item_accepted = true` —
a flag flipped only when the customer tapped the explicit Add button on
the pairing chip or completion nudge.

This was wrong in two directions:

- **Missed credit.** If the paired item was already in the cart (the chip
  rendered as a stepper rather than an Add button), the chip got no
  credit even when the customer's stepper tap was visibly caused by
  seeing the chip. If the customer added the paired item from the main
  menu after seeing the chip, same problem.
- **Stale credit.** The acceptance was recorded at tap time. If the
  customer later removed the item before submitting, the dashboard still
  counted the revenue. We never noticed because the cart-removal path
  was invisible.

ADR 0017 introduced an event bus that records the full add/remove/submit
stream. With that stream in place, we can define attribution against
*what the customer actually paid for* rather than *what they clicked on
once*.

## Decision

An item is credited as recommendation-attributed revenue if both:

1. It was added with a recommendation source — specifically, an
   `item_added` event with `payload.source ∈ {pairing_chip, completion_nudge}`.
2. It appears in the final `orders.items_json` for the same session
   (i.e. it survived to the submitted order).

Revenue uses `menu_items.price` joined at query time. The implementation
lives in migration `0042_get_aov_summary_v2.sql`. The same RPC name and
return shape is preserved so the dashboard frontend does not change.

`recommendation_shown` and `recommendation_tapped` power a separate
acceptance-rate widget — they measure the persuasive quality of the
copy and surface, not revenue. They do not enter the direct-revenue
number.

Voice-driven adds (`source: "voice"`) are excluded from
recommendation attribution by design. They still appear in the event
stream and the order still counts toward `total_revenue` and
`session_count`, but no portion of voice-added revenue is credited to
the recommendation system.

## Alternatives considered

- **Tap-time accept flag (the v1 rule).** Rejected — see Context. Both
  under-counts (stepper bumps, post-chip main-menu adds) and over-counts
  (removed-before-submit) by design.
- **Last-touch attribution: any item with a `recommendation_shown` in the
  session gets credit if added at all.** Rejected. Too generous —
  someone may have seen a chip for an item they were already planning to
  order. Conflates exposure with influence.
- **Cart-state reconstruction from `item_added` minus `item_removed`
  events.** Rejected. Both `items_json` and event-derived cart state
  would yield the same answer in the common case, but `items_json` is
  the authoritative truth the kitchen cooks from. Using it skips an
  entire class of "event ordering / dedupe / replay" bugs and aligns
  the dashboard with what the customer paid for.
- **Include voice in attribution.** Rejected for now. The voice
  resolver does not know which items are currently surfaced as
  recommendations on the kiosk, so it can't tell whether a voice add
  was nudged by a chip the customer just saw or unprompted. Solving
  this requires routing recommendation context from the kiosk into the
  voice resolver — a separate change with its own ADR.

## Consequences

What gets easier:

- The dashboard's direct-revenue number means something physical: this
  is money the kitchen received that traces to an act of nudging.
  Operators can act on it without caveats about "this is the click count,
  the actual conversion may differ."
- Acceptance-rate (`recommendation_tapped` / `recommendation_shown`) and
  conversion-rate (acceptance × survival) become orthogonal levers we
  can iterate on independently. Changing chip copy moves the first;
  changing pricing or item match moves the second.
- Adding a new recommendation surface is a single source-string
  addition; the attribution rule automatically extends.

What gets harder:

- The dashboard now reads from the event stream rather than a
  pre-aggregated flag. If the event bus drops events (bug, network),
  attribution under-counts. ADR 0017's "fail loudly via `console.error`"
  is a partial mitigation; a server-side write path would be a stronger
  one.
- The voice gap is now a documented choice rather than an accident.
  Until voice attribution lands, the dashboard's recommendation-revenue
  number understates the true effect of nudges if a chef pivots toward
  voice-led ordering.

What this commits us to:

- Maintaining the discipline that every cart-mutating surface declares
  its source via `addToOrder` / `updateQuantity`. A new surface that
  silently emits `source: "main_menu"` for a recommendation-driven add
  becomes an attribution undercount that nothing else surfaces.
- Keeping `orders.items_json` as the survival-truth source. If that
  field is ever superseded (per-line order_items table, for example),
  the RPC moves to whatever replaces it.

What would force us to revisit:

- Voice-led ordering becomes the dominant path for nudge acceptance.
  Excluding it then misrepresents reality, not just the pilot.
- A pricing model that surfaces bundles or substitutions, where
  per-item revenue attribution stops mapping cleanly to a single
  `menu_items.price` row.
- The acceptance-rate widget consistently reports >>0 while
  direct-revenue stays low — would signal a different problem
  (customers tap then remove) and may justify adding a "kept on cart at
  submit" intermediate metric.
