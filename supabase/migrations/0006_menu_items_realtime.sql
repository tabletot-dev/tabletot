-- 0006_menu_items_realtime.sql
-- Enable Realtime on menu_items so kiosk clients receive INSERT/UPDATE/DELETE
-- events immediately when POS admin edits items (active toggle, price changes, etc.)
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
