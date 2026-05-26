-- 0025_trigger_functions_security_definer.sql
--
-- Trigger functions were SECURITY INVOKER, so they ran as 'anon' when the kiosk
-- (unauthenticated) fired them. RLS on restaurant_tables allows anon SELECT only —
-- no UPDATE — so the UPDATE inside each trigger was silently blocked by RLS.
-- SECURITY DEFINER makes the function run as its owner (postgres) which bypasses RLS.

CREATE OR REPLACE FUNCTION mark_table_occupied_on_session_start()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE restaurant_tables
     SET status     = 'occupied',
         updated_at = now()
   WHERE id = NEW.table_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
