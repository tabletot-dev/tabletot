-- Restaurant exists
SELECT * FROM restaurants;

-- Menu loaded and scoped
SELECT COUNT(*) FROM menu_items WHERE restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Aliases in DB (not zero)
SELECT COUNT(*) FROM menu_item_aliases WHERE restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Anchor items exist (Chef's Picks pattern needs these)
SELECT * FROM anchor_items WHERE restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- A table row exists (voice session needs this)
SELECT * FROM restaurant_tables WHERE restaurant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';