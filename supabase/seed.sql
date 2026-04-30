insert into restaurant_tables (table_number, status) values
  ('T1', 'available'),
  ('T2', 'available'),
  ('T3', 'available')
ON CONFLICT DO NOTHING;

-- menu_items and anchor_items are populated by scripts/import_menu.py.
-- Do not add fake/placeholder items here.