-- 0066_clear_table_state_order_on_cancel.sql
--
-- Fix (2026-08-28 pre-deployment audit, finding 3): table_state.order_id was
-- only ever cleared by payment_settled and service_ended (0049, 0052).
-- Cancelling an order in POS (Orders.tsx: a direct `orders.status =
-- 'cancelled'` write) never touched it. So the NEXT order_submitted for that
-- table still saw v_state.order_id IS NOT NULL, took append_event's merge
-- branch (0048/0063), and merged the cancelled order's items back in —
-- resurrecting a voided order onto the guest's bill.
--
-- Extends archive_kot_on_order_cancel() (0059, status vocab fixed in 0060)
-- rather than adding a second trigger, since it already fires exactly once
-- per genuine cancel (AFTER UPDATE OF status ON orders, guarded by
-- OLD.status IS DISTINCT FROM 'cancelled'). Guarded to
-- `table_state.order_id = NEW.id` so a stale/duplicate fire can't clear a
-- different, newer order's pointer. span_id/state are untouched — a
-- cancelled order doesn't end the guest's visit, only what's currently
-- billable.

CREATE OR REPLACE FUNCTION archive_kot_on_order_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE kot_tickets SET status = 'cancelled'
    WHERE order_id = NEW.id AND status IN ('accepted', 'preparing', 'ready');

    UPDATE table_state
    SET order_id = NULL, updated_at = now()
    WHERE order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION archive_kot_on_order_cancel() IS
  'v3 (0066): also clears table_state.order_id for the cancelled order, so the next order_submitted starts a fresh order instead of merging into the cancelled one.';
