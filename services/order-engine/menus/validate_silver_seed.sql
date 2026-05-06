-- validate_silver_seed.sql
-- Run after applying 0009 and 0010 to confirm Silver Specialty Coffee was seeded correctly.
-- All queries are read-only. Expected values are derived from silver-ssc-hyd.json and
-- the pairings/anchors defined in 0010_silver_pairings_anchors.sql.

-- ============================================================
-- 0. Resolve restaurant (sanity check — should return exactly 1 row)
-- ============================================================

SELECT id, name, pos_provider, created_at
FROM   restaurants
WHERE  name = 'Silver Specialty Coffee';

-- ============================================================
-- 1. menu_items count
--    Expected: 49
--    (49 simple items; no variant_group rows in this menu)
-- ============================================================

SELECT COUNT(*) AS menu_items_count
FROM   menu_items
WHERE  restaurant_id = (
  SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee'
);

-- ============================================================
-- 2. menu_items breakdown by category
--    Expected distribution (from silver-ssc-hyd.json):
--      All Day Breakfast  : 6
--      Silver Breakfast   : 2
--      Smoothie Bowls     : 4
--      Pancakes           : 3
--      Fries              : 3
--      Sandwiches         : 3
--      Focaccia           : 2
--      Burgers            : 2
--      Pastas             : 4
--      Hot Coffee         : 6
--      Signature Coffee   : 6
--      Iced Coffee        : 5
--      Tea & Chocolate    : 2
--      Desserts           : 1
--                 Total   : 49
-- ============================================================

SELECT   category, COUNT(*) AS item_count
FROM     menu_items
WHERE    restaurant_id = (
  SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee'
)
GROUP BY category
ORDER BY category;

-- ============================================================
-- 3. item_pairings count
--    Expected: 32
--    (33 HTML pairings minus 1 dangling 'cold-brew' reference)
-- ============================================================

SELECT COUNT(*) AS item_pairings_count
FROM   item_pairings
WHERE  restaurant_id = (
  SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee'
);

-- ============================================================
-- 4. anchor_items count
--    Expected: 13
--    (Quick Add omitted; 4 anchor types across 10 items)
-- ============================================================

SELECT COUNT(*) AS anchor_items_count
FROM   anchor_items
WHERE  restaurant_id = (
  SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee'
);

-- ============================================================
-- 5. anchor_items breakdown by type
--    Expected:
--      chef_pick  : 2  (Avocado Toast, Affogato)
--      bestseller : 5  (Veggie Bagel, Silver Breakfast Non Veg,
--                        Peri Peri Chicken, Nashville Chicken, Spanish Latte)
--      new        : 2  (Egg Bagel, Berry)
--      signature  : 4  (Avocado Toast, French Toast, Original, Spanish Latte)
-- ============================================================

SELECT   anchor_type, COUNT(*) AS count
FROM     anchor_items
WHERE    restaurant_id = (
  SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee'
)
GROUP BY anchor_type
ORDER BY anchor_type;

-- ============================================================
-- 6. Orphan check — item_pairings referencing missing menu_items
--    Expected: 0 rows
-- ============================================================

SELECT *
FROM   item_pairings
WHERE  source_item_id NOT IN (SELECT id FROM menu_items)
   OR  paired_item_id NOT IN (SELECT id FROM menu_items);

-- ============================================================
-- 7. Orphan check — anchor_items referencing missing menu_items
--    Expected: 0 rows
-- ============================================================

SELECT *
FROM   anchor_items
WHERE  item_id NOT IN (SELECT id FROM menu_items);
