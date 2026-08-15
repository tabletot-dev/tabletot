-- 0059_archive_kot_on_order_cancel.sql
-- Fix (pos-only-live-qa-findings.md #2): cancelling an order via POS /orders
-- (a direct `orders.status = 'cancelled'` write, per 0056's comment on that
-- call site) never propagated to kot_tickets. 0035's trigger only covers
-- KOT → Order; there was no Order(cancelled) → KOT direction, so Kitchen
-- Display kept showing the ticket as active indefinitely. Mirrors the
-- archive semantics append_event's payment_settled/service_ended already use
-- (UPDATE kot_tickets SET status='archived' WHERE order_id = ... AND status
-- IN ('accepted','preparing','ready')) — 'archived' is this schema's only
-- "done, remove from active queue" state; there's no separate 'cancelled'
-- vocab for kot_tickets.

CREATE OR REPLACE FUNCTION archive_kot_on_order_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE kot_tickets SET status = 'archived'
    WHERE order_id = NEW.id AND status IN ('accepted', 'preparing', 'ready');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_kot_on_order_cancel ON orders;
CREATE TRIGGER trg_archive_kot_on_order_cancel
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION archive_kot_on_order_cancel();
