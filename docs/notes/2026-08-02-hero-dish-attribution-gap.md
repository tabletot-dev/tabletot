# Hero-dish attribution gap — fix verified, historical size unknown

Part of `docs/plans/2026-08-02-three-app-hardening.md` Task 3.2.

## What was wrong

`append_event` writes `span_id = NULL` for analytics events (`item_added`,
`recommendation_shown`, etc.) fired while the table is idle
(`supabase/migrations/0047`). A span only opens on `session_started` or
implicitly on `order_submitted`. The kiosk's HomeView hero-dish tap
(`apps/kiosk/src/pages/Index.tsx`, `onSelectItem`) jumped straight to the
item-detail screen without calling `startSession()` — only the "Start
Ordering" button did. So every `item_added` on that path — including
`pairing_chip` and `completion_nudge` adds — landed with `span_id = NULL`, and
`get_aov_summary`'s `rec_adds` CTE joins on `span_id` (migration 0050), which
NULL never matches. Their recommendation revenue was invisible while their
order still counted toward `total_revenue` — a silent, unbounded undercount
in exactly the number a pilot conversation with the restaurant owner would
lean on.

## Fix

`onSelectItem` now awaits `startSession()` before navigating, mirroring the
"Start Ordering" button exactly. `session_started` is idempotent for an
already-open span, so a later "Start Ordering" tap is a no-op.

## Verified (2026-08-02, local Postgres)

Simulated the fixed flow directly against `append_event`:
`session_started` → `item_added` with `source: 'pairing_chip'` → confirmed
`table_events.span_id IS NOT NULL` for that row → `order_submitted` →
confirmed the item appears in `get_aov_summary`'s `accepted_count`. Full
transcript in `CHANGELOG.md` under Phase 3.

## Not done — needs Rohan, against remote

The plan asked to quantify the historical gap before shipping, via:

```sql
SELECT event_type, span_id IS NULL AS orphaned, count(*)
FROM table_events WHERE event_type = 'item_added'
GROUP BY 1,2;
```

This session only has access to local Docker Supabase (per repo convention —
migrations are applied locally only, Rohan pushes to remote himself), which
has no real pilot traffic. **Run this against the remote/production database
after this migration lands there**, before using pre-fix AOV numbers in any
owner conversation — the result tells you what fraction of recommendation
revenue was silently missing, so the old dashboard numbers can be captioned
honestly ("understated by at least X%") rather than presented as exact.
