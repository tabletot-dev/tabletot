-- 0002_internal_canonical_tables.sql
-- Canonical internal menu and provider-mapping tables.
-- menu_items is the authoritative source for the recommendation layer and order engine.
-- item_variants and item_addons link directly to menu_items via uuid FK.
-- external_id_mapping bridges internal UUIDs to provider-specific IDs (e.g. Petpooja).

-- ============================================================
-- Menu items (canonical shape for order engine + recommendation layer)
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  category   text,
  price      numeric,
  active     boolean     NOT NULL DEFAULT true,
  tags       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items (category);
CREATE INDEX IF NOT EXISTS idx_menu_items_active   ON menu_items (active);

-- ============================================================
-- Item variants (POS shape; linked to menu_items by uuid)
-- ============================================================

CREATE TABLE IF NOT EXISTS item_variants (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id   uuid        NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_type   text,                   -- e.g. 'size', 'spice'
  variant_name   text        NOT NULL,
  price_modifier numeric     NOT NULL DEFAULT 0,
  is_default     boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_variants_menu_item_id ON item_variants (menu_item_id);

-- ============================================================
-- Item add-ons (flat per-item, POS shape)
-- ============================================================

CREATE TABLE IF NOT EXISTS item_addons (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid        NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  addon_name   text        NOT NULL,
  price        numeric     NOT NULL DEFAULT 0,
  is_available boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_addons_menu_item_id ON item_addons (menu_item_id);

-- ============================================================
-- External ID mapping (bridges internal UUIDs to provider IDs)
-- ============================================================

CREATE TABLE IF NOT EXISTS external_id_mapping (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_item_id uuid        NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  provider         text        NOT NULL,
  external_id      text        NOT NULL,
  UNIQUE (provider, external_id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_id_mapping_internal ON external_id_mapping (internal_item_id);

-- ============================================================
-- restaurant_tables — already created in 0001; IF NOT EXISTS is a no-op.
-- Included here per spec for standalone environments where 0001 may not be applied.
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text        NOT NULL UNIQUE,
  area         text,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
