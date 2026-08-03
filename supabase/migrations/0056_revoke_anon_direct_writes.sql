-- 0056_revoke_anon_direct_writes.sql
--
-- Drops 0032's anon_update policies on orders/sessions. append_event is
-- SECURITY DEFINER (bypasses RLS entirely), so these were never load-bearing
-- for the ledger path — they left the single-writer invariant (ADR 0019)
-- enforced by convention rather than permissions. `recommendation_events`'
-- anon_update isn't touched here; that table was already dropped in 0051.
--
-- Verified safe before writing this migration:
--   - grep found zero direct `.from('orders'|'sessions').update(...)` calls
--     anywhere in the kiosk (the only anon-role caller).
--   - `orders`/`sessions` both carry a separate `staff_write` policy
--     (FOR ALL TO authenticated USING true WITH CHECK true) that POS's two
--     remaining direct writes (Billing.tsx's discount apply, Orders.tsx's
--     manual status dropdown) already go through — unaffected by this drop.

DROP POLICY IF EXISTS "anon_update" ON public.orders;
DROP POLICY IF EXISTS "anon_update" ON public.sessions;
