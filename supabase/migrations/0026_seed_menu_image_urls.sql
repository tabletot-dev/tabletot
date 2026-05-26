-- 0026_seed_menu_image_urls.sql
--
-- Seeds image_url on all 46 menu items that have a matching file in the
-- menu-images Supabase Storage bucket (silver/ folder).
-- 3 items have no image yet (Fries x3) — left null, kiosk shows category gradient.
-- 2 unidentified files (silver3540.webp, silver3621.webp) deferred — see TODOs.md.

DO $$
DECLARE
  base text := 'https://dfbuwwinlahgtghyifgv.supabase.co/storage/v1/object/public/menu-images/silver/';
BEGIN

  -- All Day Breakfast
  UPDATE menu_items SET image_url = base || 'avcado-toast.webp'            WHERE name = 'Avocado Toast';
  UPDATE menu_items SET image_url = base || 'egg-bagel.webp'               WHERE name = 'Egg Bagel';
  UPDATE menu_items SET image_url = base || 'french-omlette.webp'          WHERE name = 'French Omelette';
  UPDATE menu_items SET image_url = base || 'french-toast.webp'            WHERE name = 'French Toast';
  UPDATE menu_items SET image_url = base || 'turkish-eggs.webp'            WHERE name = 'Turkish Eggs';
  UPDATE menu_items SET image_url = base || 'veggie-bagel.webp'            WHERE name = 'Veggie Bagel';

  -- Burgers
  UPDATE menu_items SET image_url = base || 'nashville-burger.webp'        WHERE name = 'Nashville Chicken';
  UPDATE menu_items SET image_url = base || 'veg-burger.webp'              WHERE name = 'Veggie Patty';

  -- Desserts
  UPDATE menu_items SET image_url = base || 'affogato.png'                 WHERE name = 'Affogato';

  -- Focaccia
  UPDATE menu_items SET image_url = base || 'foccacia-chicken.webp'        WHERE name = 'Chicken'  AND category = 'Focaccia';
  UPDATE menu_items SET image_url = base || 'foccacia-mushroom.webp'       WHERE name = 'Mushroom' AND category = 'Focaccia';

  -- Fries — no images yet (silver3540.webp / silver3621.webp candidates, deferred)
  -- Chilli Lime Fries, Classic Fries, Peri Peri Fries → left null

  -- Hot Coffee
  UPDATE menu_items SET image_url = base || 'cuppocino.webp'               WHERE name = 'Cappuccino';
  UPDATE menu_items SET image_url = base || 'cortado.webp'                 WHERE name = 'Cortado';
  UPDATE menu_items SET image_url = base || 'flat-white.webp'              WHERE name = 'Flat White';
  UPDATE menu_items SET image_url = base || 'cuppocino.webp'               WHERE name = 'Latte';
  UPDATE menu_items SET image_url = base || 'long-black.webp'              WHERE name = 'Long Black';
  UPDATE menu_items SET image_url = base || 'mocha.webp'                   WHERE name = 'Mocha';

  -- Iced Coffee
  UPDATE menu_items SET image_url = base || 'espresso-cranberry.png'       WHERE name = 'Espresso Cranberry';
  UPDATE menu_items SET image_url = base || 'espresso-orange.png'          WHERE name = 'Espresso Orange';
  UPDATE menu_items SET image_url = base || 'iced-latte-iced-mocha.webp'   WHERE name = 'Iced Latte';
  UPDATE menu_items SET image_url = base || 'iced-long-black.png'          WHERE name = 'Iced Long Black';
  UPDATE menu_items SET image_url = base || 'iced-latte-iced-mocha.webp'   WHERE name = 'Iced Mocha';

  -- Pancakes
  UPDATE menu_items SET image_url = base || 'banana-panckaes.webp'         WHERE name = 'Banana'   AND category = 'Pancakes';
  UPDATE menu_items SET image_url = base || 'original-panckakes.webp'      WHERE name = 'Original' AND category = 'Pancakes';
  UPDATE menu_items SET image_url = base || 'pb-andj-pancakes.webp'        WHERE name = 'PB & J';

  -- Pastas
  UPDATE menu_items SET image_url = base || 'aglio-e-oilio.webp'           WHERE name = 'Aglio e Olio';
  UPDATE menu_items SET image_url = base || 'alfredo-pasta.webp'           WHERE name = 'Alfredo'   AND category = 'Pastas';
  UPDATE menu_items SET image_url = base || 'arrabiata-pasta.webp'         WHERE name = 'Arrabiata';
  UPDATE menu_items SET image_url = base || 'pesto-pasta.webp'             WHERE name = 'Pesto'     AND category = 'Pastas';

  -- Sandwiches
  UPDATE menu_items SET image_url = base || 'corn-and-spinach-sandwich.webp'   WHERE name = 'Corn & Spinach';
  UPDATE menu_items SET image_url = base || 'peri-peri-chicken-sandwich.webp'  WHERE name = 'Peri Peri Chicken' AND category = 'Sandwiches';
  UPDATE menu_items SET image_url = base || 'veggie-sandwich.webp'             WHERE name = 'Veggie'            AND category = 'Sandwiches';

  -- Signature Coffee
  UPDATE menu_items SET image_url = base || 'espresso-lime.webp'           WHERE name = 'Espresso Lime';
  UPDATE menu_items SET image_url = base || 'espresso-tonic.webp'          WHERE name = 'Espresso Tonic';
  UPDATE menu_items SET image_url = base || 'silver-cold-brew.png'         WHERE name = 'Silver Cold Brew';
  UPDATE menu_items SET image_url = base || 'silver-cold-coffee.webp'      WHERE name = 'Silver Cold Coffee';
  UPDATE menu_items SET image_url = base || 'espresso.png'                 WHERE name = 'Silver Espresso';
  UPDATE menu_items SET image_url = base || 'spanish-latte.png'            WHERE name = 'Spanish Latte';

  -- Silver Breakfast
  UPDATE menu_items SET image_url = base || 'silver-non-veg-bf.webp'       WHERE name = 'Silver Breakfast Non Veg';
  UPDATE menu_items SET image_url = base || 'silver-veg-bf.webp'           WHERE name = 'Silver Breakfast Veg';

  -- Smoothie Bowls
  UPDATE menu_items SET image_url = base || 'berry-bowl.webp'              WHERE name = 'Berry'       AND category = 'Smoothie Bowls';
  UPDATE menu_items SET image_url = base || 'cacao-bowl.webp'              WHERE name = 'Cacao'       AND category = 'Smoothie Bowls';
  UPDATE menu_items SET image_url = base || 'greek-yogurt-bowl.webp'       WHERE name = 'Greek Yogurt';
  UPDATE menu_items SET image_url = base || 'vanilla-mush.webp'            WHERE name = 'Vanilla Mush';

  -- Tea & Chocolate
  UPDATE menu_items SET image_url = base || 'hot-chocolate.png'            WHERE name = 'Hot Chocolate';
  UPDATE menu_items SET image_url = base || 'teas.webp'                    WHERE name = 'Teas';

END $$;
