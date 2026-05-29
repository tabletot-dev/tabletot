-- 0029_silver_menu_aliases_and_modifiers.sql
-- Migrates voice-resolution data from silver-ssc-hyd.json into the DB.
--
-- Changes:
--   1. Add modifiers JSONB column to menu_items.
--   2. Populate modifiers for Teas (the only Silver SSC item with a modifier).
--   3. Seed Silver SSC voice aliases into menu_item_aliases.
--      Aliases are sourced directly from the aliases section of the
--      now-deleted silver-ssc-hyd.json.

-- ============================================================
-- 1. Add modifiers column
-- ============================================================

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS modifiers jsonb;

-- ============================================================
-- 2. Populate Teas modifier
-- ============================================================

UPDATE menu_items
SET modifiers = '{"tea_choice": {"label": "Choose your tea", "options": ["Spearmint", "Green Tea", "Chamomile", "Blue Pea"], "required": true, "price_impact": 0}}'::jsonb
WHERE restaurant_id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91'
  AND name = 'Teas';

-- ============================================================
-- 3. Seed Silver SSC voice aliases into menu_item_aliases
--    Uses a VALUES table of (alias_text, item_name) pairs, joined to
--    menu_items to resolve UUIDs. ON CONFLICT (restaurant_id, alias)
--    DO NOTHING makes this idempotent.
-- ============================================================

WITH silver AS (
  SELECT 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91'::uuid AS rid
),
alias_map (alias_text, item_name) AS (
  VALUES
    -- Avocado Toast
    ('avo toast',                  'Avocado Toast'),
    ('avocado',                    'Avocado Toast'),
    ('avocado on toast',           'Avocado Toast'),
    -- Veggie Bagel
    ('veg bagel',                  'Veggie Bagel'),
    -- French Omelette
    ('omelette',                   'French Omelette'),
    -- Silver Breakfast
    ('silver veg breakfast',       'Silver Breakfast Veg'),
    ('silver non veg breakfast',   'Silver Breakfast Non Veg'),
    ('silver nonveg breakfast',    'Silver Breakfast Non Veg'),
    -- Smoothie Bowls
    ('berry bowl',                 'Berry'),
    ('berry smoothie bowl',        'Berry'),
    ('cacao bowl',                 'Cacao'),
    ('greek yogurt bowl',          'Greek Yogurt'),
    ('yogurt bowl',                'Greek Yogurt'),
    ('vanilla mush bowl',          'Vanilla Mush'),
    -- Pancakes
    ('original pancakes',          'Original'),
    ('classic pancakes',           'Original'),
    ('pancakes',                   'Original'),
    ('banana pancakes',            'Banana'),
    ('pb j',                       'PB & J'),
    ('pb and j',                   'PB & J'),
    ('peanut butter pancakes',     'PB & J'),
    ('peanut butter jelly pancakes','PB & J'),
    -- Fries
    ('fries',                      'Classic Fries'),
    ('plain fries',                'Classic Fries'),
    ('chilli fries',               'Chilli Lime Fries'),
    ('lime fries',                 'Chilli Lime Fries'),
    ('peri fries',                 'Peri Peri Fries'),
    -- Sandwiches
    ('veg sandwich',               'Veggie'),
    ('vegetable sandwich',         'Veggie'),
    ('corn sandwich',              'Corn & Spinach'),
    ('corn spinach',               'Corn & Spinach'),
    ('peri peri chicken sandwich', 'Peri Peri Chicken'),
    ('peri peri sandwich',         'Peri Peri Chicken'),
    ('peri peri chicken',          'Peri Peri Chicken'),
    ('chicken sandwich',           'Peri Peri Chicken'),
    -- Focaccia
    ('chicken focaccia',           'Chicken'),
    ('mushroom focaccia',          'Mushroom'),
    -- Burgers
    ('nashville burger',           'Nashville Chicken'),
    ('nashville chicken burger',   'Nashville Chicken'),
    ('nashville',                  'Nashville Chicken'),
    ('veg burger',                 'Veggie Patty'),
    ('veggie burger',              'Veggie Patty'),
    -- Pastas
    ('aglio olio',                 'Aglio e Olio'),
    ('garlic pasta',               'Aglio e Olio'),
    ('arrabbiata',                 'Arrabiata'),
    ('red sauce pasta',            'Arrabiata'),
    ('white sauce pasta',          'Alfredo'),
    ('creamy pasta',               'Alfredo'),
    ('pesto pasta',                'Pesto'),
    ('green pasta',                'Pesto'),
    -- Signature Coffee
    ('espresso',                   'Silver Espresso'),
    ('shot',                       'Silver Espresso'),
    ('cold brew',                  'Silver Cold Brew'),
    ('lime coffee',                'Espresso Lime'),
    ('lime espresso',              'Espresso Lime'),
    ('tonic coffee',               'Espresso Tonic'),
    ('tonic espresso',             'Espresso Tonic'),
    ('spanish coffee',             'Spanish Latte'),
    ('condensed milk latte',       'Spanish Latte'),
    ('cold coffee',                'Silver Cold Coffee'),
    ('blended coffee',             'Silver Cold Coffee'),
    -- Iced Coffee
    ('iced black',                 'Iced Long Black'),
    ('black iced coffee',          'Iced Long Black'),
    ('orange coffee',              'Espresso Orange'),
    ('orange espresso',            'Espresso Orange'),
    ('cranberry coffee',           'Espresso Cranberry'),
    ('cranberry espresso',         'Espresso Cranberry'),
    ('cold latte',                 'Iced Latte'),
    ('cold mocha',                 'Iced Mocha'),
    -- Tea & Chocolate
    ('hot choco',                  'Hot Chocolate'),
    ('chocolate',                  'Hot Chocolate'),
    ('tea',                        'Teas'),
    ('spearmint tea',              'Teas'),
    ('green tea',                  'Teas'),
    ('chamomile',                  'Teas'),
    ('chamomile tea',              'Teas'),
    ('blue pea tea',               'Teas')
)
INSERT INTO menu_item_aliases (restaurant_id, item_id, alias)
SELECT
  silver.rid,
  mi.id,
  am.alias_text
FROM alias_map am
JOIN silver ON true
JOIN menu_items mi
  ON mi.restaurant_id = silver.rid
 AND mi.name = am.item_name
ON CONFLICT (restaurant_id, alias) DO NOTHING;
