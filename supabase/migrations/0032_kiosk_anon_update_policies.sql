-- 0032_kiosk_anon_update_policies.sql
-- Unblock three anonymous UPDATE paths required for pilot operation:
--   1. recommendation_events — CompletionNudge toggling item_accepted
--   2. orders               — multi-round ordering (Round 2+ item merge)
--   3. sessions             — bill_requested signal and session close

CREATE POLICY "anon_update" ON public.recommendation_events
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_update" ON public.orders
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_update" ON public.sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
