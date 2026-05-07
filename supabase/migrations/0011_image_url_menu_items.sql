-- 0011_image_url_menu_items.sql
-- Adds nullable image_url to menu_items.
-- DishCard, CartView, and WaitingView fall back to category-gradient placeholders when null.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS image_url text;
