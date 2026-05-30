-- 0027_ab_table_seed_and_cleanup.sql
-- 1. Seed T2 for Silver (treatment table, is_treatment=true).
-- 2. Set T1 is_treatment=false (explicit A/B assignment).
-- 3. Guarded DELETE for Roast CCx — verifies no child rows via ON DELETE CASCADE
--    before executing, since 0007 added CASCADE on all domain tables.

-- ============================================================
-- 1. Seed T2 for Silver (treatment)
--    ON CONFLICT DO UPDATE ensures is_treatment=true even if T2 already
--    exists with the wrong flag (e.g. from a partial earlier seed).
-- ============================================================

INSERT INTO restaurant_tables (table_number, capacity, status, restaurant_id, is_treatment)
VALUES ('T2', 4, 'available', 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91', true)
ON CONFLICT (restaurant_id, table_number) DO UPDATE
  SET is_treatment = EXCLUDED.is_treatment;

-- ============================================================
-- 2. Set T1 is_treatment=false (explicit — default is false but
--    documenting the A/B assignment is worth the redundancy).
-- ============================================================

UPDATE restaurant_tables
SET    is_treatment = false
WHERE  restaurant_id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91'
  AND  table_number  = 'T1';

-- ============================================================
-- 3. Guarded DELETE for Roast CCx
--    0007 added ON DELETE CASCADE on menu_items, orders, kot_tickets,
--    restaurant_tables, item_pairings, anchor_items, meal_completion_rules,
--    recommendation_events. A blind DELETE would silently cascade.
--    We verify child_count = 0 first.
-- ============================================================

DO $$
DECLARE
  roast_id    uuid;
  child_count bigint;
BEGIN
  SELECT id INTO roast_id FROM restaurants WHERE name = 'Roast CCx';

  IF roast_id IS NULL THEN
    RAISE NOTICE 'Roast CCx not found — nothing to delete';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO child_count FROM (
    SELECT 1 FROM menu_items            WHERE restaurant_id = roast_id
    UNION ALL
    SELECT 1 FROM orders                WHERE restaurant_id = roast_id
    UNION ALL
    SELECT 1 FROM kot_tickets           WHERE restaurant_id = roast_id
    UNION ALL
    SELECT 1 FROM restaurant_tables     WHERE restaurant_id = roast_id
    UNION ALL
    SELECT 1 FROM item_pairings         WHERE restaurant_id = roast_id
    UNION ALL
    SELECT 1 FROM anchor_items          WHERE restaurant_id = roast_id
    UNION ALL
    SELECT 1 FROM meal_completion_rules WHERE restaurant_id = roast_id
    UNION ALL
    SELECT 1 FROM recommendation_events WHERE restaurant_id = roast_id
  ) AS child_rows;

  IF child_count > 0 THEN
    RAISE EXCEPTION
      'Roast CCx (id: %) has % child rows across domain tables — '
      'delete aborted. Remove or reassign child rows first.',
      roast_id, child_count;
  END IF;

  DELETE FROM restaurants WHERE id = roast_id;
  RAISE NOTICE 'Roast CCx deleted (id: %)', roast_id;
END;
$$;
