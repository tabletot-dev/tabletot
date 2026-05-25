-- 0017_bill_requests_table_requests_settings_trigger.sql
--
-- 1. bill_requests  — kiosk signals POS that a customer wants the bill
-- 2. table_requests — kiosk signals POS for water / assistance
-- 3. restaurant_settings — key-value config (GST rate, currency, name)
-- 4. Trigger: KOT status advances → mirror to orders.status

-- ============================================================
-- bill_requests
-- ============================================================

CREATE TABLE IF NOT EXISTS bill_requests (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid        NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  order_id   uuid        REFERENCES orders(id) ON DELETE SET NULL,
  phone      text,
  status     text        NOT NULL DEFAULT 'pending',  -- pending | acknowledged | settled
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_requests_table_id ON bill_requests (table_id);
CREATE INDEX IF NOT EXISTS idx_bill_requests_status   ON bill_requests (status);

-- ============================================================
-- table_requests
-- ============================================================

CREATE TABLE IF NOT EXISTS table_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     uuid        NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  request_type text        NOT NULL,  -- 'water' | 'assistance'
  status       text        NOT NULL DEFAULT 'pending',  -- pending | acknowledged
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_requests_table_id ON table_requests (table_id);
CREATE INDEX IF NOT EXISTS idx_table_requests_status   ON table_requests (status);

-- ============================================================
-- restaurant_settings
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_settings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid        REFERENCES restaurants(id) ON DELETE CASCADE,
  key           text        NOT NULL,
  value         text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- NULL restaurant_id = global default; non-null = per-restaurant override
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_settings_global_key
  ON restaurant_settings (key) WHERE restaurant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_settings_per_restaurant
  ON restaurant_settings (restaurant_id, key) WHERE restaurant_id IS NOT NULL;

-- Global defaults (no restaurant_id)
INSERT INTO restaurant_settings (key, value) VALUES
  ('gst_rate',        '5'),
  ('currency_symbol', '₹'),
  ('restaurant_name', 'Silver Specialty Coffee');

-- ============================================================
-- Realtime enrollment
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE bill_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE table_requests;

-- ============================================================
-- Trigger: KOT status → orders.status
-- ============================================================

CREATE OR REPLACE FUNCTION sync_order_status_from_kot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'preparing' THEN
    UPDATE orders
       SET status = 'preparing', updated_at = now()
     WHERE id = NEW.order_id
       AND status NOT IN ('served', 'completed', 'paid', 'cancelled');

  ELSIF NEW.status = 'ready' THEN
    UPDATE orders
       SET status = 'ready', updated_at = now()
     WHERE id = NEW.order_id
       AND status NOT IN ('served', 'completed', 'paid', 'cancelled');

  ELSIF NEW.status = 'completed' THEN
    UPDATE orders
       SET status = 'served', updated_at = now()
     WHERE id = NEW.order_id
       AND status NOT IN ('completed', 'paid', 'cancelled');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_order_status_from_kot
  AFTER UPDATE OF status ON kot_tickets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_order_status_from_kot();
