-- 0060_kot_cancelled_status.sql
-- Fix (ADR 0022, docs/plans/2026-08-15-revenue-integrity-and-cancellation-fixes.md
-- Task 1): 0059's archive_kot_on_order_cancel() archived a cancelled order's
-- KOT the same way a normally-completed one is archived. 'archived' meant
-- two different things, and that overload is exactly what let
-- sync_order_status_from_kot() (0055) mistake a cancel-driven archive for a
-- normal one: it saw "all KOTs archived" and set orders.status = 'served',
-- silently overwriting the 'cancelled' status in the same transaction.
--
-- Fix: give kot_tickets a distinct 'cancelled' status. No change needed to
-- sync_order_status_from_kot() (0055) — 'cancelled' matches none of its
-- branches (not 'archived', not 'preparing'/'ready'), so it now naturally
-- no-ops on a cancel instead of colliding with it.

CREATE OR REPLACE FUNCTION archive_kot_on_order_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE kot_tickets SET status = 'cancelled'
    WHERE order_id = NEW.id AND status IN ('accepted', 'preparing', 'ready');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION archive_kot_on_order_cancel() IS
  'v2 (0060): sets kot_tickets.status to ''cancelled'', not ''archived'' — archived is reserved for normal completion so sync_order_status_from_kot() cannot mistake a cancel for one.';
