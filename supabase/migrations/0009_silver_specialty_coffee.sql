-- 0009_silver_specialty_coffee.sql
-- Adds is_veg to menu_items; seeds Silver Specialty Coffee restaurant and all 49 menu items.
-- external_id_mapping is intentionally left empty — adapter slot reserved for post-pilot.

-- ============================================================
-- 1. Add is_veg column
-- ============================================================

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_veg boolean NOT NULL DEFAULT true;

-- ============================================================
-- 2. Unique indexes to make ON CONFLICT DO NOTHING functional
--    on repeated runs (db reset + re-apply or live backfill).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_name_uidx
  ON restaurants (name);

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_restaurant_name_uidx
  ON menu_items (restaurant_id, name);

-- ============================================================
-- 3. Seed restaurant and menu items in one CTE.
--    If the restaurant name already exists the RETURNING clause
--    yields zero rows; the CROSS JOIN then inserts nothing.
-- ============================================================

WITH restaurant AS (
  INSERT INTO restaurants (id, name, pos_provider)
  VALUES ('b22b5d53-6dd8-4f5b-8276-2e828cd1ab91', 'Silver Specialty Coffee', 'tabletot')
  ON CONFLICT (name) DO NOTHING
  RETURNING id
)
INSERT INTO menu_items (restaurant_id, name, category, price, is_veg)
SELECT
  r.id,
  v.item_name,
  v.item_category,
  v.item_price,
  v.item_is_veg
FROM restaurant r
CROSS JOIN (VALUES
  -- All Day Breakfast
  ('Avocado Toast',            'All Day Breakfast',  390, true),
  ('Veggie Bagel',             'All Day Breakfast',  360, true),
  ('Egg Bagel',                'All Day Breakfast',  370, false),
  ('French Omelette',          'All Day Breakfast',  350, true),
  ('Turkish Eggs',             'All Day Breakfast',  380, true),
  ('French Toast',             'All Day Breakfast',  400, true),

  -- Silver Breakfast
  ('Silver Breakfast Veg',     'Silver Breakfast',   585, true),
  ('Silver Breakfast Non Veg', 'Silver Breakfast',   600, false),

  -- Smoothie Bowls
  ('Berry',                    'Smoothie Bowls',     400, true),
  ('Cacao',                    'Smoothie Bowls',     375, true),
  ('Greek Yogurt',             'Smoothie Bowls',     375, true),
  ('Vanilla Mush',             'Smoothie Bowls',     370, true),

  -- Pancakes
  ('Original',                 'Pancakes',           350, true),
  ('Banana',                   'Pancakes',           340, true),
  ('PB & J',                   'Pancakes',           360, true),

  -- Fries
  ('Classic Fries',            'Fries',              215, true),
  ('Chilli Lime Fries',        'Fries',              245, true),
  ('Peri Peri Fries',          'Fries',              245, true),

  -- Sandwiches
  ('Veggie',                   'Sandwiches',         375, true),
  ('Corn & Spinach',           'Sandwiches',         375, true),
  ('Peri Peri Chicken',        'Sandwiches',         390, false),

  -- Focaccia
  ('Chicken',                  'Focaccia',           375, false),
  ('Mushroom',                 'Focaccia',           380, true),

  -- Burgers
  ('Nashville Chicken',        'Burgers',            390, false),
  ('Veggie Patty',             'Burgers',            430, true),

  -- Pastas
  ('Aglio e Olio',             'Pastas',             380, true),
  ('Arrabiata',                'Pastas',             380, true),
  ('Alfredo',                  'Pastas',             380, true),
  ('Pesto',                    'Pastas',             380, true),

  -- Hot Coffee
  ('Cappuccino',               'Hot Coffee',         240, true),
  ('Latte',                    'Hot Coffee',         250, true),
  ('Mocha',                    'Hot Coffee',         310, true),
  ('Long Black',               'Hot Coffee',         230, true),
  ('Cortado',                  'Hot Coffee',         220, true),
  ('Flat White',               'Hot Coffee',         250, true),

  -- Signature Coffee
  ('Silver Espresso',          'Signature Coffee',   185, true),
  ('Silver Cold Brew',         'Signature Coffee',   290, true),
  ('Espresso Lime',            'Signature Coffee',   290, true),
  ('Espresso Tonic',           'Signature Coffee',   290, true),
  ('Spanish Latte',            'Signature Coffee',   290, true),
  ('Silver Cold Coffee',       'Signature Coffee',   330, true),

  -- Iced Coffee
  ('Iced Long Black',          'Iced Coffee',        230, true),
  ('Espresso Orange',          'Iced Coffee',        290, true),
  ('Espresso Cranberry',       'Iced Coffee',        290, true),
  ('Iced Latte',               'Iced Coffee',        270, true),
  ('Iced Mocha',               'Iced Coffee',        330, true),

  -- Tea & Chocolate
  ('Hot Chocolate',            'Tea & Chocolate',    320, true),
  ('Teas',                     'Tea & Chocolate',    225, true),

  -- Desserts
  ('Affogato',                 'Desserts',           270, true)

) AS v(item_name, item_category, item_price, item_is_veg)
ON CONFLICT (restaurant_id, name) DO NOTHING;
