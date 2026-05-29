-- 0031_silver_item_descriptions.sql
-- Seeds descriptions for Silver SSC menu items from the JSON source.
-- Required for DB-only menu loader — generate_menu_summary uses descriptions
-- for LLM context.

DO $$
DECLARE
  rid CONSTANT uuid := 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';
BEGIN
  UPDATE menu_items SET description = 'Avocado mash on sourdough.'                      WHERE restaurant_id = rid AND json_id = 'avocado_toast';
  UPDATE menu_items SET description = 'Bagel with egg and savory house filling.'         WHERE restaurant_id = rid AND json_id = 'egg_bagel';
  UPDATE menu_items SET description = 'Signature vegetarian breakfast platter.'          WHERE restaurant_id = rid AND json_id = 'silver_breakfast_veg';
  UPDATE menu_items SET description = 'Signature non-vegetarian breakfast platter.'      WHERE restaurant_id = rid AND json_id = 'silver_breakfast_non_veg';
  UPDATE menu_items SET description = 'Berry smoothie bowl.'                             WHERE restaurant_id = rid AND json_id = 'berry_bowl';
  UPDATE menu_items SET description = 'Cacao smoothie bowl.'                             WHERE restaurant_id = rid AND json_id = 'cacao_bowl';
  UPDATE menu_items SET description = 'Greek yogurt smoothie bowl.'                      WHERE restaurant_id = rid AND json_id = 'greek_yogurt_bowl';
  UPDATE menu_items SET description = 'Vanilla mush smoothie bowl.'                      WHERE restaurant_id = rid AND json_id = 'vanilla_mush';
  UPDATE menu_items SET description = 'Classic pancakes.'                                WHERE restaurant_id = rid AND json_id = 'original_pancakes';
  UPDATE menu_items SET description = 'Peanut butter and jelly pancakes.'                WHERE restaurant_id = rid AND json_id = 'pbj_pancakes';
  UPDATE menu_items SET description = 'Fries with chilli lime seasoning.'                WHERE restaurant_id = rid AND json_id = 'chilli_lime_fries';
  UPDATE menu_items SET description = 'Fries with peri peri seasoning.'                  WHERE restaurant_id = rid AND json_id = 'peri_peri_fries';
  UPDATE menu_items SET description = 'Grilled chicken sandwich with peri peri kick.'    WHERE restaurant_id = rid AND json_id = 'peri_peri_chicken_sandwich';
  UPDATE menu_items SET description = 'Fried chicken burger served with house fries.'    WHERE restaurant_id = rid AND json_id = 'nashville_chicken_burger';
  UPDATE menu_items SET description = 'Classic garlic and olive oil pasta.'              WHERE restaurant_id = rid AND json_id = 'aglio_e_olio';
  UPDATE menu_items SET description = 'Red sauce pasta.'                                 WHERE restaurant_id = rid AND json_id = 'arrabiata';
  UPDATE menu_items SET description = 'Creamy white sauce pasta.'                        WHERE restaurant_id = rid AND json_id = 'alfredo';
  UPDATE menu_items SET description = 'Green pesto pasta.'                               WHERE restaurant_id = rid AND json_id = 'pesto_pasta';
  UPDATE menu_items SET description = 'House espresso shot.'                             WHERE restaurant_id = rid AND json_id = 'silver_espresso';
  UPDATE menu_items SET description = 'House cold brew.'                                 WHERE restaurant_id = rid AND json_id = 'silver_cold_brew';
  UPDATE menu_items SET description = 'Espresso with a citrus lift.'                     WHERE restaurant_id = rid AND json_id = 'espresso_lime';
  UPDATE menu_items SET description = 'Espresso over tonic water.'                       WHERE restaurant_id = rid AND json_id = 'espresso_tonic';
  UPDATE menu_items SET description = 'Sweet latte with condensed milk.'                 WHERE restaurant_id = rid AND json_id = 'spanish_latte';
  UPDATE menu_items SET description = 'Blended cold coffee.'                             WHERE restaurant_id = rid AND json_id = 'silver_cold_coffee';
  UPDATE menu_items SET description = 'Espresso over fresh orange.'                      WHERE restaurant_id = rid AND json_id = 'espresso_orange';
  UPDATE menu_items SET description = 'Espresso with cranberry.'                         WHERE restaurant_id = rid AND json_id = 'espresso_cranberry';
  UPDATE menu_items SET description = 'Choose from spearmint, green tea, chamomile, or blue pea.' WHERE restaurant_id = rid AND json_id = 'teas';
  UPDATE menu_items SET description = 'Espresso poured over ice cream.'                  WHERE restaurant_id = rid AND json_id = 'affogato';
END $$;
