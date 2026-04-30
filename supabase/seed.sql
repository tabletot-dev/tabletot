-- Seed the pilot restaurant first so backfills below can reference its UUID.
INSERT INTO restaurants (id, name, pos_provider)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Roast CCx Hyderabad', 'tabletot')
ON CONFLICT DO NOTHING;

insert into restaurant_tables (table_number, status) values
  ('T1', 'available'),
  ('T2', 'available'),
  ('T3', 'available')
ON CONFLICT DO NOTHING;

-- menu_items and anchor_items are populated by scripts/import_menu.py.
-- Do not add fake/placeholder items here.

-- Backfill restaurant_id for all rows that predate scoping.
UPDATE menu_items SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
UPDATE item_pairings SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
UPDATE anchor_items SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
UPDATE meal_completion_rules SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
UPDATE recommendation_events SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
UPDATE orders SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
UPDATE kot_tickets SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
UPDATE restaurant_tables SET restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE restaurant_id IS NULL;
