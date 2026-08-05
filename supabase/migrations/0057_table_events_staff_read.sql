-- 0057_table_events_staff_read.sql
--
-- docs/plans/2026-08-03-idle-table-notification.md ("Zero migrations needed")
-- assumed table_events was already readable by both apps, same as table_state.
-- Verified against local Postgres that this is false: table_events has RLS
-- enabled (0047) with zero policies, so a client-side SELECT (anon or
-- authenticated) silently returns no rows — the POS idle badge would never
-- appear, the exact "confident wrong answer" class of bug the three-app
-- hardening pass (docs/plans/2026-08-02-three-app-hardening.md) was fixing.
--
-- Read-only, staff-scoped, same pattern as 0022's staff_read on
-- recommendation_events/voice_turns and 0047's table_state_read. Does not
-- touch the single-writer invariant (ADR 0019) — that's about writes;
-- append_event is SECURITY DEFINER and already bypasses RLS entirely.

CREATE POLICY staff_read ON public.table_events FOR SELECT TO authenticated USING (true);
