-- 0019_sessions_table.sql
--
-- First-class session entity: one row per customer visit at a table.
-- Anchors all orders, KOTs, bill requests, and table requests for that visit.
-- Enables bidirectional kiosk↔POS communication via Realtime.

-- ============================================================
-- sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id      uuid        REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id           uuid        NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  table_number       text        NOT NULL,
  session_key        text        NOT NULL UNIQUE,  -- matches tt_session_id in kiosk sessionStorage
  status             text        NOT NULL DEFAULT 'active',
                                 -- active | bill_requested | closed
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  bill_requested_by  text        -- 'customer' | 'staff'
);

CREATE INDEX IF NOT EXISTS idx_sessions_table_id    ON sessions (table_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status      ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_sessions_session_key ON sessions (session_key);

-- Enroll in Realtime so both kiosk and POS receive changes immediately
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;

-- ============================================================
-- Trigger 1: session INSERT → mark table occupied
-- ============================================================

CREATE OR REPLACE FUNCTION mark_table_occupied_on_session_start()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE restaurant_tables
     SET status     = 'occupied',
         updated_at = now()
   WHERE id = NEW.table_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mark_table_occupied_on_session_start
  AFTER INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION mark_table_occupied_on_session_start();

-- ============================================================
-- Trigger 2: session UPDATE (status → closed) → free the table
-- ============================================================

CREATE OR REPLACE FUNCTION free_table_on_session_close()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    UPDATE restaurant_tables
       SET status           = 'available',
           current_order_id = NULL,
           updated_at       = now()
     WHERE id = NEW.table_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_free_table_on_session_close
  AFTER UPDATE OF status ON sessions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION free_table_on_session_close();

-- ============================================================
-- Trigger 3: first orders INSERT for a session → set current_order_id
-- Fires when kiosk sends first KOT; wires the order into the table
-- so POS Billing can find it via table.current_order_id.
-- Only fires if current_order_id is not already set (first order wins).
-- ============================================================

CREATE OR REPLACE FUNCTION wire_order_to_table_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.table_id IS NOT NULL THEN
    UPDATE restaurant_tables
       SET current_order_id = NEW.id,
           updated_at       = now()
     WHERE id                = NEW.table_id
       AND current_order_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wire_order_to_table_on_insert
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION wire_order_to_table_on_insert();
