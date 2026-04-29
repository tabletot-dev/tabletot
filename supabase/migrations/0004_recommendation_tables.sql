CREATE TABLE IF NOT EXISTS item_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  paired_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  priority int DEFAULT 0,
  context text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anchor_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  anchor_type text CHECK (anchor_type IN ('chef_pick', 'bestseller', 'new', 'signature')),
  priority int DEFAULT 0,
  active_window jsonb,
  active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_completion_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  condition jsonb,
  suggestion jsonb,
  priority int DEFAULT 0,
  active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  table_id uuid,
  pattern_type text,
  item_shown uuid REFERENCES menu_items(id),
  item_accepted bool,
  cart_value_at_show numeric,
  timestamp timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_pairings_source ON item_pairings(source_item_id);
CREATE INDEX IF NOT EXISTS idx_anchor_items_type_active ON anchor_items(anchor_type, active);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_session ON recommendation_events(session_id);
