-- Verify Silver Specialty Coffee DB state after db reset
-- Silver SSC restaurant UUID: b22b5d53-6dd8-4f5b-8276-2e828cd1ab91

-- Restaurant exists
SELECT * FROM restaurants;

-- Menu loaded and scoped to Silver
SELECT COUNT(*) FROM menu_items WHERE restaurant_id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';

-- Aliases in DB (not zero)
SELECT COUNT(*) FROM menu_item_aliases WHERE restaurant_id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';

-- Anchor items exist (Chef's Picks pattern needs these)
SELECT * FROM anchor_items WHERE restaurant_id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';

-- Tables exist and are scoped to Silver
SELECT * FROM restaurant_tables WHERE restaurant_id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';

-- Sessions table exists (migration 0019)
SELECT * FROM sessions LIMIT 5;
