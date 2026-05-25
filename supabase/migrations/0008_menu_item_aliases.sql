-- 0008_menu_item_aliases.sql
-- Persists menu item aliases to DB so they can be managed without editing the
-- menu JSON. The resolver loads aliases from this table at startup (with JSON
-- fallback if the table is empty).

CREATE TABLE IF NOT EXISTS menu_item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(restaurant_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_aliases_restaurant_alias
  ON menu_item_aliases(restaurant_id, alias);
