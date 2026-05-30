-- Fix B1: Rename KOT status 'pending' → 'accepted'.
-- 'pending' was kiosk-facing ("I submitted this"); 'accepted' is kitchen-facing
-- ("the system has received and queued this ticket").
UPDATE kot_tickets SET status = 'accepted' WHERE status = 'pending';
ALTER TABLE kot_tickets ALTER COLUMN status SET DEFAULT 'accepted';

-- Fix B2: Rename KOT status 'completed' → 'archived'.
-- 'completed' on a KOT conflicted with 'completed' on orders (different meanings).
-- 'archived' means the ticket is done and removed from the active kitchen queue.
UPDATE kot_tickets SET status = 'archived' WHERE status = 'completed';

-- Fix C2 (data): Kiosk was inserting orders with status='pending' instead of 'new'.
-- Normalise any existing rows so the POS colour map works correctly.
UPDATE orders SET status = 'new' WHERE status = 'pending';

-- Fix A1: KOT → Order cross-talk trigger.
-- When a KOT status changes the trigger propagates the aggregate kitchen state
-- up to orders so the POS Orders page reflects kitchen progress automatically.
CREATE OR REPLACE FUNCTION sync_order_status_from_kot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_status  text;
  v_active_count  int;
  v_ready_count   int;
  v_preparing_count int;
BEGIN
  -- Skip if no linked order or if the status didn't change.
  IF NEW.order_id IS NULL OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Archiving a KOT never changes the order (it happens post-payment).
  IF NEW.status = 'archived' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_order_status FROM orders WHERE id = NEW.order_id;

  SELECT
    count(*) FILTER (WHERE status != 'archived'),
    count(*) FILTER (WHERE status = 'ready'),
    count(*) FILTER (WHERE status = 'preparing')
  INTO v_active_count, v_ready_count, v_preparing_count
  FROM kot_tickets
  WHERE order_id = NEW.order_id;

  IF v_active_count > 0 AND v_active_count = v_ready_count THEN
    -- Every active KOT is ready → the full order is ready.
    UPDATE orders SET status = 'ready' WHERE id = NEW.order_id;
  ELSIF v_preparing_count > 0 AND v_order_status = 'new' THEN
    -- Kitchen has started at least one ticket; advance order from 'new'.
    UPDATE orders SET status = 'preparing' WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_status_from_kot ON kot_tickets;
CREATE TRIGGER trg_sync_order_status_from_kot
  AFTER UPDATE OF status ON kot_tickets
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_status_from_kot();
