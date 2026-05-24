-- 0014_pin_silver_uuid.sql
-- Migration 0009 inserted Silver Specialty Coffee with gen_random_uuid(), meaning
-- every `db reset` produces a different UUID. VITE_RESTAURANT_ID and the voice
-- backend's restaurants.json both hardcode b22b5d53-6dd8-4f5b-8276-2e828cd1ab91.
-- This migration pins Silver's PK to that UUID so local resets stay consistent.
--
-- Safe to run on an already-correct DB (no-ops if UUIDs already match).

DO $$
DECLARE
  old_id uuid;
  new_id constant uuid := 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';
BEGIN
  SELECT id INTO old_id
  FROM restaurants
  WHERE name = 'Silver Specialty Coffee'
  LIMIT 1;

  IF old_id IS NULL OR old_id = new_id THEN
    RETURN;
  END IF;

  -- Temporarily rename old row to release the unique name constraint,
  -- then insert the new row with the pinned UUID.
  UPDATE restaurants SET name = '__migrating__' WHERE id = old_id;

  INSERT INTO restaurants (id, name, pos_provider, config)
  SELECT new_id, 'Silver Specialty Coffee', pos_provider, config
  FROM   restaurants
  WHERE  id = old_id;

  -- Re-point all FK references to the new UUID.
  UPDATE menu_items          SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE item_pairings       SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE anchor_items        SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE meal_completion_rules SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE recommendation_events SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE orders              SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE kot_tickets         SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE restaurant_tables   SET restaurant_id = new_id WHERE restaurant_id = old_id;
  UPDATE menu_item_aliases   SET restaurant_id = new_id WHERE restaurant_id = old_id;

  -- Remove the now-orphaned old row.
  DELETE FROM restaurants WHERE id = old_id;
END $$;
