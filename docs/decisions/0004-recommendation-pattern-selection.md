---
status: accepted
date: 2026-05-08
tags: [recommendations, architecture, voice, touch]
---

# 0004 — Recommendation patterns: SQL-only on touch, LLM only on voice

## Context

The core value proposition of Tabletot is measurable AOV lift through
contextual recommendations. Before building anything, we needed to decide
which recommendation patterns to implement and how to compute them — in
particular, whether the LLM should be involved on the touch (tap) path.

Constraints:
- Touch ordering must feel instant. Any perceptible latency on the add-to-cart
  or cart-review flow kills the UX.
- LLM calls take 1–3 seconds and add per-request cost.
- Curation data (pairings, anchor items, completion rules) is owner-controlled
  and small — it fits comfortably in Postgres.
- Voice is inherently slower (STT round-trip + TTS playback); latency budget
  is more forgiving.

## Decision

Four patterns for pilot:

1. **Post-add pairing nudge** — shown inline after a customer adds an item
   to cart. "Goes well with X." SQL query against `item_pairings`.
2. **Anchor-on-empty** — chef's picks / bestsellers shown when the cart is
   empty. SQL query against `anchor_items`.
3. **Pre-submit completion nudge** — gentle suggestion before the customer
   confirms their order. SQL query against `meal_completion_rules`.
4. **Ask AI soft upsell** — voice path only. Two-pass LLM flow weaves curated
   pairings into the spoken response.

**Touch path is LLM-free.** All three touch patterns are SQL-only.  
**Voice path uses the two-pass LLM flow** for pattern 4 only.  
The LLM never confirms items it did not successfully resolve.

## Alternatives considered

- **LLM on all paths** — rejected. Unacceptable latency on touch. Cost
  scales with every add-to-cart interaction across all tables.
- **Rule engine (if/then logic in code)** — rejected. SQL queries against
  curated tables are simpler to reason about, easier for owners to tune,
  and require no deployment to update.
- **Collaborative filtering / ML** — rejected for pilot. Requires order
  history volume we don't have yet. Revisit post-launch once
  `recommendation_events` has meaningful data.

## Consequences

- Recommendation quality on the touch path is bounded by curation quality.
  Bad curation data → bad nudges. The dashboard exists to make curation easy.
- The `item_pairings`, `anchor_items`, and `meal_completion_rules` tables
  are load-bearing. Schema changes to these require coordinating across
  kiosk, dashboard, and order-engine.
- AOV lift is measurable from day one via `recommendation_events` — every
  nudge shown and accepted is logged. This is intentional: we need the data
  to justify the product claim.
- Adding a new touch pattern in future is cheap (another SQL query). Adding
  a new voice pattern requires LLM prompt work.
