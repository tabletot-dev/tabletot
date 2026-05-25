-- 0021_menu_items_description.sql
-- Adds nullable description column to menu_items.
-- Used by POS Menu page and kiosk DetailView for item copy.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS description text;
