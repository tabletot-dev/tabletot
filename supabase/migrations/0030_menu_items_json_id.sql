-- 0030_menu_items_json_id.sql
-- Adds json_id column to menu_items.
-- json_id is the slug used as item_id in the voice resolution index (e.g. "avocado_toast").
-- Seeded for all 49 Silver SSC items so the loader can build MenuIndex from DB only,
-- without needing the services/order-engine/menus/<id>.json file.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS json_id text;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_json_id_uidx
  ON menu_items (restaurant_id, json_id)
  WHERE json_id IS NOT NULL;

-- ============================================================
-- Seed Silver SSC item json_ids
-- ============================================================

DO $$
DECLARE
  rid CONSTANT uuid := 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';
BEGIN
  -- All Day Breakfast
  UPDATE menu_items SET json_id = 'avocado_toast'         WHERE restaurant_id = rid AND name = 'Avocado Toast';
  UPDATE menu_items SET json_id = 'veggie_bagel'          WHERE restaurant_id = rid AND name = 'Veggie Bagel';
  UPDATE menu_items SET json_id = 'egg_bagel'             WHERE restaurant_id = rid AND name = 'Egg Bagel';
  UPDATE menu_items SET json_id = 'french_omelette'       WHERE restaurant_id = rid AND name = 'French Omelette';
  UPDATE menu_items SET json_id = 'turkish_eggs'          WHERE restaurant_id = rid AND name = 'Turkish Eggs';
  UPDATE menu_items SET json_id = 'french_toast'          WHERE restaurant_id = rid AND name = 'French Toast';

  -- Silver Breakfast
  UPDATE menu_items SET json_id = 'silver_breakfast_veg'     WHERE restaurant_id = rid AND name = 'Silver Breakfast Veg';
  UPDATE menu_items SET json_id = 'silver_breakfast_non_veg' WHERE restaurant_id = rid AND name = 'Silver Breakfast Non Veg';

  -- Smoothie Bowls
  UPDATE menu_items SET json_id = 'berry_bowl'            WHERE restaurant_id = rid AND name = 'Berry';
  UPDATE menu_items SET json_id = 'cacao_bowl'            WHERE restaurant_id = rid AND name = 'Cacao';
  UPDATE menu_items SET json_id = 'greek_yogurt_bowl'     WHERE restaurant_id = rid AND name = 'Greek Yogurt';
  UPDATE menu_items SET json_id = 'vanilla_mush'          WHERE restaurant_id = rid AND name = 'Vanilla Mush';

  -- Pancakes
  UPDATE menu_items SET json_id = 'original_pancakes'     WHERE restaurant_id = rid AND name = 'Original';
  UPDATE menu_items SET json_id = 'banana_pancakes'       WHERE restaurant_id = rid AND name = 'Banana';
  UPDATE menu_items SET json_id = 'pbj_pancakes'          WHERE restaurant_id = rid AND name = 'PB & J';

  -- Fries
  UPDATE menu_items SET json_id = 'classic_fries'         WHERE restaurant_id = rid AND name = 'Classic Fries';
  UPDATE menu_items SET json_id = 'chilli_lime_fries'     WHERE restaurant_id = rid AND name = 'Chilli Lime Fries';
  UPDATE menu_items SET json_id = 'peri_peri_fries'       WHERE restaurant_id = rid AND name = 'Peri Peri Fries';

  -- Sandwiches
  UPDATE menu_items SET json_id = 'veggie_sandwich'           WHERE restaurant_id = rid AND name = 'Veggie' AND category = 'Sandwiches';
  UPDATE menu_items SET json_id = 'corn_spinach_sandwich'     WHERE restaurant_id = rid AND name = 'Corn & Spinach';
  UPDATE menu_items SET json_id = 'peri_peri_chicken_sandwich' WHERE restaurant_id = rid AND name = 'Peri Peri Chicken' AND category = 'Sandwiches';

  -- Focaccia
  UPDATE menu_items SET json_id = 'chicken_focaccia'      WHERE restaurant_id = rid AND name = 'Chicken' AND category = 'Focaccia';
  UPDATE menu_items SET json_id = 'mushroom_focaccia'     WHERE restaurant_id = rid AND name = 'Mushroom' AND category = 'Focaccia';

  -- Burgers
  UPDATE menu_items SET json_id = 'nashville_chicken_burger' WHERE restaurant_id = rid AND name = 'Nashville Chicken';
  UPDATE menu_items SET json_id = 'veggie_patty_burger'      WHERE restaurant_id = rid AND name = 'Veggie Patty';

  -- Pastas
  UPDATE menu_items SET json_id = 'aglio_e_olio'          WHERE restaurant_id = rid AND name = 'Aglio e Olio';
  UPDATE menu_items SET json_id = 'arrabiata'             WHERE restaurant_id = rid AND name = 'Arrabiata';
  UPDATE menu_items SET json_id = 'alfredo'               WHERE restaurant_id = rid AND name = 'Alfredo';
  UPDATE menu_items SET json_id = 'pesto_pasta'           WHERE restaurant_id = rid AND name = 'Pesto' AND category = 'Pastas';

  -- Hot Coffee
  UPDATE menu_items SET json_id = 'cappuccino'            WHERE restaurant_id = rid AND name = 'Cappuccino';
  UPDATE menu_items SET json_id = 'latte'                 WHERE restaurant_id = rid AND name = 'Latte';
  UPDATE menu_items SET json_id = 'mocha'                 WHERE restaurant_id = rid AND name = 'Mocha';
  UPDATE menu_items SET json_id = 'long_black'            WHERE restaurant_id = rid AND name = 'Long Black';
  UPDATE menu_items SET json_id = 'cortado'               WHERE restaurant_id = rid AND name = 'Cortado';
  UPDATE menu_items SET json_id = 'flat_white'            WHERE restaurant_id = rid AND name = 'Flat White';

  -- Signature Coffee
  UPDATE menu_items SET json_id = 'silver_espresso'       WHERE restaurant_id = rid AND name = 'Silver Espresso';
  UPDATE menu_items SET json_id = 'silver_cold_brew'      WHERE restaurant_id = rid AND name = 'Silver Cold Brew';
  UPDATE menu_items SET json_id = 'espresso_lime'         WHERE restaurant_id = rid AND name = 'Espresso Lime';
  UPDATE menu_items SET json_id = 'espresso_tonic'        WHERE restaurant_id = rid AND name = 'Espresso Tonic';
  UPDATE menu_items SET json_id = 'spanish_latte'         WHERE restaurant_id = rid AND name = 'Spanish Latte';
  UPDATE menu_items SET json_id = 'silver_cold_coffee'    WHERE restaurant_id = rid AND name = 'Silver Cold Coffee';

  -- Iced Coffee
  UPDATE menu_items SET json_id = 'iced_long_black'       WHERE restaurant_id = rid AND name = 'Iced Long Black';
  UPDATE menu_items SET json_id = 'espresso_orange'       WHERE restaurant_id = rid AND name = 'Espresso Orange';
  UPDATE menu_items SET json_id = 'espresso_cranberry'    WHERE restaurant_id = rid AND name = 'Espresso Cranberry';
  UPDATE menu_items SET json_id = 'iced_latte'            WHERE restaurant_id = rid AND name = 'Iced Latte';
  UPDATE menu_items SET json_id = 'iced_mocha'            WHERE restaurant_id = rid AND name = 'Iced Mocha';

  -- Tea & Chocolate
  UPDATE menu_items SET json_id = 'hot_chocolate'         WHERE restaurant_id = rid AND name = 'Hot Chocolate';
  UPDATE menu_items SET json_id = 'teas'                  WHERE restaurant_id = rid AND name = 'Teas';

  -- Desserts
  UPDATE menu_items SET json_id = 'affogato'              WHERE restaurant_id = rid AND name = 'Affogato';
END $$;
