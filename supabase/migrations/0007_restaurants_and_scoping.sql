-- 0007_restaurants_and_scoping.sql
-- Create restaurants table and add restaurant_id scoping to all domain tables.

-- 1. Create restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pos_provider text CHECK (pos_provider IN ('tabletot', 'petpooja')) DEFAULT 'tabletot',
  created_at timestamptz DEFAULT now()
);

-- 2. Add restaurant_id to every scoping table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE item_pairings ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE anchor_items ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE meal_completion_rules ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE recommendation_events ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE kot_tickets ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
