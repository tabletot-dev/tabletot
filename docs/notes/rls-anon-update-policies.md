# RLS: Anonymous UPDATE Policies (migration 0032)

Three RLS gaps were identified where the kiosk's anonymous Supabase client called
`.update()` on tables that only had `anon_insert` policies. All three blocked
operations silently or visibly depending on error handling.

## What was broken

### 1. `recommendation_events` — completion nudge accept logging
`CompletionNudge.tsx` sets `item_accepted: true` on an event row when the customer
taps an accepted recommendation. The update was silently swallowed (no error
handling around it). No touch-accept conversions were being recorded.

### 2. `orders` — multi-round ordering (Round 2+)
`orderSubmission.ts` merges the new cart with the existing order row via `.update()`
for any order submission after the first in a session. This threw a visible error
that crashed the order submission screen. Multi-round ordering was fully broken.

### 3. `sessions` — bill request and session close signals
`BillView.tsx` updates `sessions.status` to `"bill_requested"` after inserting a
`bill_requests` row, so the POS gets a session-level signal. `Index.tsx` similarly
sets `status: "closed"` when the session ends. Both calls were silently swallowed
(catch blocks do not rethrow). The POS never received these status transitions.

## Fix

Migration `0032_kiosk_anon_update_policies.sql` adds `anon_update` policies with
`USING (true) WITH CHECK (true)` on all three tables. Appropriate for a
single-restaurant pilot where the kiosk runs on controlled hardware.

## Caveat — silent failure still present on `sessions` updates

The two `sessions` update calls (bill_requested, closed) remain inside
fire-and-forget error handlers. After the migration, the RLS block is removed so
they will succeed under normal conditions. But if they fail for any other reason
(network blip, schema constraint), the failure is still silent — the UI shows
success and the POS is never notified. This is a pre-existing code quality issue,
not introduced by the migration. It's low-risk for pilot (single restaurant,
controlled hardware), but should be hardened before multi-site rollout.

## Hardening path before multi-site

The broad `USING (true)` policies are acceptable for a known single-tenant
deployment. Before expanding to multiple restaurants, restrict UPDATE scope
to rows owned by the session, e.g. matching `session_key` to a claim on the
request, or route these writes through a service-role Edge Function rather than
direct anon client calls.
