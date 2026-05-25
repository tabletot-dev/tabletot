-- 0016_fix_table_number_unique.sql
-- The original table_number UNIQUE constraint is global, not per-restaurant.
-- This breaks multi-tenant setups where two restaurants both have a T1.
-- Fix: drop the global constraint, add a composite one on (restaurant_id, table_number).
-- Then seed Silver's T1 (0015 was silently skipped because the Roast CCx T1 conflicted).

ALTER TABLE restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_table_number_key;

ALTER TABLE restaurant_tables
  ADD CONSTRAINT restaurant_tables_restaurant_table_uidx
  UNIQUE (restaurant_id, table_number);

INSERT INTO restaurant_tables (table_number, capacity, status, restaurant_id)
VALUES ('T1', 4, 'available', 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91')
ON CONFLICT (restaurant_id, table_number) DO NOTHING;
