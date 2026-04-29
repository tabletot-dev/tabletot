insert into restaurant_tables (table_number, status) values
  ('T1', 'available'),
  ('T2', 'available'),
  ('T3', 'available');

-- Use hardcoded UUIDs — gen_random_uuid() does not work in static seed files

INSERT INTO menu_items (id, name, category, price, active) VALUES
  ('aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', 'Filter Coffee', 'Beverages', 120, true),
  ('aaaaaaaa-0002-0002-0002-aaaaaaaaaaaa', 'Cold Brew', 'Beverages', 180, true),
  ('aaaaaaaa-0003-0003-0003-aaaaaaaaaaaa', 'Chicken Sandwich', 'Mains', 220, true),
  ('aaaaaaaa-0004-0004-0004-aaaaaaaaaaaa', 'Belgian Waffle', 'Desserts', 160, true),
  ('aaaaaaaa-0005-0005-0005-aaaaaaaaaaaa', 'Masala Chai', 'Beverages', 80, true),
  ('aaaaaaaa-0006-0006-0006-aaaaaaaaaaaa', 'Mushroom Toast', 'Mains', 190, true)
ON CONFLICT DO NOTHING;

INSERT INTO anchor_items (item_id, anchor_type, priority, active) VALUES
  ('aaaaaaaa-0002-0002-0002-aaaaaaaaaaaa', 'chef_pick', 4, true),
  ('aaaaaaaa-0003-0003-0003-aaaaaaaaaaaa', 'chef_pick', 3, true),
  ('aaaaaaaa-0004-0004-0004-aaaaaaaaaaaa', 'chef_pick', 2, true),
  ('aaaaaaaa-0006-0006-0006-aaaaaaaaaaaa', 'chef_pick', 1, true)
ON CONFLICT DO NOTHING;