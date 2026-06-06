---
status: accepted
date: 2026-06-05
tags: [measurement, dashboard, pilot]
---

# 0015 — Pilot AOV dashboard reports direct attribution, not cohort A/B

## Context

Migrations 0012 and 0027 introduced a Welch's t-test–based A/B measurement
system for AOV lift, comparing a treatment cohort (table T2, always shown
recommendations) against a control cohort (T1, never shown). The dashboard
(AovView) surfaces averages, delta, t-statistic, and p-value from that RPC.

Neither migration was paired with a design decision. On review, three
problems make the current system unsuitable for the Silver pilot:

1. **Selection bias.** T1 and T2 are physically different tables — size,
   location, customer mix. Any observed difference may be explained by
   seating, not by the recommendation engine. There is no fix for this at
   n=2 tables.
2. **Sample size.** A 4-week pilot at one café yields ~50–100 sessions.
   At that volume the Welch's-t p-value is mathematically valid but
   practically noisy — it will swing wildly between weeks and is more
   likely to mislead the restaurant owner than inform them.
3. **Owner legibility.** Restaurant owners do not reason in p-values or
   cohort comparisons. They reason in receipts: *did this thing sell
   things, and how much.* A direct-attribution number is the kind of
   evidence they can verify against their own POS.

The kiosk already logs every accepted recommendation in
`recommendation_events` with `item_shown` and `item_accepted`. The data
needed for direct attribution exists today.

## Decision

The pilot dashboard reports a single primary metric: **direct attributed
revenue** — the sum of menu prices for items shown as recommendations and
subsequently added to the order — plus an itemized breakdown of which
items were accepted and how many times. A secondary panel shows
window-level revenue and session count for context.

Concretely:

- A new RPC `get_aov_summary(restaurant_id, start, end)` (migration 0037)
  returns `direct_revenue`, `accepted_count`, `accepted_items` (jsonb
  array), `total_revenue`, and `session_count`.
- AovView is rewritten to render two cards from this RPC. The
  cohort/Welch's-t UI is removed.
- All sessions in the pilot see recommendations. There is no
  randomization (Option B). The `sessions.is_treatment` column is not
  introduced.
- The old `recommendation_aov_lift_cohort` RPC and the
  `restaurant_tables.is_treatment` seed are left in the database but no
  longer called. They are inert; deletion is a follow-up.

## Alternatives considered

- **Keep the Welch's t-test, fix the randomization.** Move treatment
  assignment from the static table column to a per-session coin flip.
  Rejected for the pilot because the sample size makes the resulting
  p-value untrustworthy regardless of how clean the randomization is, and
  because direct attribution is a strictly stronger evidence story for a
  pilot conversation with one owner. The randomization fix becomes worth
  the work later, when there are 5+ restaurants and the cohort question
  is genuinely interesting.
- **Winsorize and report median session value alongside the mean.**
  Rejected as scope creep on top of a measurement design we've already
  decided is wrong for the pilot.
- **Drop the migration and code entirely.** Considered. Rejected because
  ripping out the old RPC and the `is_treatment` column risks regressions
  in seeds and tooling for no real benefit. Comment-only deprecation is
  cheaper and reversible.

## Consequences

- The dashboard becomes simpler and more credible. Owner can cross-check
  every rupee of direct attribution against their POS receipts.
- We give up the ability to answer "would these customers have spent the
  same amount without recommendations?" during the pilot. Direct
  attribution proves the engine sold specific items but does not isolate
  systemic lift. Acceptable trade for pilot stage.
- Switching back to a randomized cohort design later is cheap: one
  column on `sessions`, three lines in `startSession()`, restore the
  comparison UI. The data we collect during this pilot can't retroactively
  serve as a control cohort, but that's a known limit.
- The inert `recommendation_aov_lift_cohort` RPC and
  `restaurant_tables.is_treatment` column remain in the schema. They
  must not grow new callers. A follow-up should remove them once we're
  confident nothing reads them.
- Voice / Ask-AI surfaces currently do not log to `recommendation_events`.
  Their contribution to direct attribution is invisible. Worth fixing
  when voice becomes a measured pattern.
