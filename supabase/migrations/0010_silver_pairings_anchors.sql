-- 0010_silver_pairings_anchors.sql
-- Seeds item_pairings and anchor_items for Silver Specialty Coffee.
-- Source of truth: tabletot-redesign.html pairings[] and tags[] arrays.
-- IDs are resolved by name at run time; this migration is safe to replay
-- after any UUID churn in the seed data.
--
-- Dangling HTML pairing reference (omitted):
--   'Veggie' (Sandwiches) → HTML id "cold-brew"
--   "cold-brew" does not exist in menuItems; the closest live item is
--   'Silver Cold Brew' (id "silver-cold-brew"). Skipped here — add
--   manually once the intent is confirmed with the Silver team.

-- ============================================================
-- 1. Unique indexes — required for ON CONFLICT DO NOTHING to fire
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS item_pairings_source_target_uidx
  ON item_pairings (source_item_id, paired_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS anchor_items_item_type_uidx
  ON anchor_items (item_id, anchor_type);

-- ============================================================
-- 2. Item pairings
--    The INNER JOINs against `items` silently drop any row whose
--    source or target name cannot be resolved — this is intentional
--    and is why the 'Veggie' → 'cold-brew' pair is safe to leave in
--    comments rather than requiring a guard clause.
-- ============================================================

WITH
  restaurant AS (
    SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee'
  ),
  items AS (
    SELECT id, name
    FROM   menu_items
    WHERE  restaurant_id = (SELECT id FROM restaurant)
  )
INSERT INTO item_pairings (restaurant_id, source_item_id, paired_item_id, priority)
SELECT r.id, src.id, tgt.id, p.priority
FROM   restaurant r
CROSS  JOIN (VALUES

  -- All Day Breakfast
  ('Avocado Toast',            'Cappuccino',          1),
  ('Avocado Toast',            'Silver Cold Brew',    2),
  ('Veggie Bagel',             'Flat White',          1),
  ('Egg Bagel',                'Cortado',             1),
  ('French Omelette',          'Long Black',          1),
  ('Turkish Eggs',             'Flat White',          1),
  ('French Toast',             'Spanish Latte',       1),

  -- Silver Breakfast
  ('Silver Breakfast Veg',     'Cappuccino',          1),
  ('Silver Breakfast Non Veg', 'Cappuccino',          1),

  -- Smoothie Bowls
  ('Berry',                    'Iced Latte',          1),
  ('Cacao',                    'Silver Espresso',     1),
  ('Greek Yogurt',             'Hot Chocolate',       1),
  ('Vanilla Mush',             'Iced Long Black',     1),

  -- Pancakes
  ('Original',                 'Hot Chocolate',       1),
  ('Banana',                   'Mocha',               1),
  ('PB & J',                   'Mocha',               1),

  -- Fries
  ('Classic Fries',            'Espresso Tonic',      1),
  ('Chilli Lime Fries',        'Iced Long Black',     1),
  ('Peri Peri Fries',          'Iced Mocha',          1),

  -- Sandwiches
  -- 'Veggie' → 'cold-brew' omitted; see file header note
  ('Corn & Spinach',           'Flat White',          1),
  ('Peri Peri Chicken',        'Espresso Lime',       1),

  -- Focaccia
  ('Chicken',                  'Iced Long Black',     1),
  ('Mushroom',                 'Cortado',             1),

  -- Burgers
  ('Nashville Chicken',        'Espresso Cranberry',  1),
  ('Veggie Patty',             'Iced Latte',          1),

  -- Pastas
  ('Aglio e Olio',             'Long Black',          1),
  ('Arrabiata',                'Cappuccino',          1),
  ('Alfredo',                  'Hot Chocolate',       1),
  ('Pesto',                    'Flat White',          1),

  -- Signature Coffee (beverage-to-food reverse pairings from the HTML)
  ('Spanish Latte',            'Original',            1),
  ('Spanish Latte',            'Avocado Toast',       2),

  -- Desserts
  ('Affogato',                 'Silver Espresso',     1)

) AS p(source_name, target_name, priority)
JOIN items src ON src.name = p.source_name
JOIN items tgt ON tgt.name = p.target_name
ON CONFLICT (source_item_id, paired_item_id) DO NOTHING;

-- ============================================================
-- 3. Anchor items
--    Tag mapping applied:
--      "Chef's Pick" → chef_pick
--      "Best Seller" → bestseller
--      "New"         → new
--      "Signature"   → signature
--      "Quick Add"   → no anchor_items equivalent; omitted
--    Priority is ordered by appearance in the HTML source within
--    each anchor_type group.
-- ============================================================

WITH
  restaurant AS (
    SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee'
  ),
  items AS (
    SELECT id, name
    FROM   menu_items
    WHERE  restaurant_id = (SELECT id FROM restaurant)
  )
INSERT INTO anchor_items (restaurant_id, item_id, anchor_type, priority)
SELECT r.id, i.id, a.anchor_type, a.priority
FROM   restaurant r
CROSS  JOIN (VALUES

  -- chef_pick
  ('Avocado Toast',            'chef_pick',   1),  -- tags: ["Chef's Pick", "Signature"]
  ('Affogato',                 'chef_pick',   2),  -- tags: ["Chef's Pick"]

  -- bestseller
  ('Veggie Bagel',             'bestseller',  1),  -- tags: ["Best Seller"]
  ('Silver Breakfast Non Veg', 'bestseller',  2),  -- tags: ["Best Seller"]
  ('Peri Peri Chicken',        'bestseller',  3),  -- tags: ["Best Seller"]
  ('Nashville Chicken',        'bestseller',  4),  -- tags: ["Best Seller"]
  ('Spanish Latte',            'bestseller',  5),  -- tags: ["Best Seller", "Signature"]

  -- new
  ('Egg Bagel',                'new',         1),  -- tags: ["New"]
  ('Berry',                    'new',         2),  -- tags: ["New"]

  -- signature
  ('Avocado Toast',            'signature',   1),  -- tags: ["Chef's Pick", "Signature"]
  ('French Toast',             'signature',   2),  -- tags: ["Signature"]
  ('Original',                 'signature',   3),  -- tags: ["Signature"]
  ('Spanish Latte',            'signature',   4)   -- tags: ["Best Seller", "Signature"]

) AS a(item_name, anchor_type, priority)
JOIN items i ON i.name = a.item_name
ON CONFLICT (item_id, anchor_type) DO NOTHING;
