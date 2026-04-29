-- 0001_pos_native_schema.sql
-- POS-native schema: every table shaped exactly as the real apps/pos code expects.
-- Derived from the per-file diagnosis in docs/notes/pos-table-diagnosis.md.
-- No RLS, no seed data. Applied via: supabase db reset.

-- ============================================================
-- Areas (table zones / sections)
-- ============================================================

CREATE TABLE IF NOT EXISTS areas (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Menu categories (POS admin UI)
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_categories (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  description   text,
  display_order integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Discount types / coupons
-- ============================================================

CREATE TABLE IF NOT EXISTS discount_types (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  discount_type   text        NOT NULL,  -- 'coupon' | 'percentage' | 'flat'
  coupon_code     text,
  value           numeric     NOT NULL,
  min_order_value numeric     NOT NULL DEFAULT 0,
  max_discount    numeric,
  is_active       boolean     NOT NULL DEFAULT true,
  valid_until     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Profiles (Supabase Auth companion)
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id         uuid        PRIMARY KEY,  -- same as auth.users.id
  email      text,
  full_name  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- User roles
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    uuid        PRIMARY KEY,  -- auth.users.id; managed by Supabase Auth
  role       text        NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Staff
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,                       -- auth.users.id; nullable (placeholder flow)
  full_name  text        NOT NULL,
  role       text        NOT NULL,       -- 'admin'|'manager'|'captain'|'chef'|'staff'|'waiter'
  phone      text,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Restaurant tables
-- ============================================================
-- current_order_id FK to orders is added after orders is created (below).
-- assigned_captain stored as text (staff.user_id value) — no FK to avoid cycle.

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number     text        NOT NULL UNIQUE,
  capacity         integer,
  status           text        NOT NULL DEFAULT 'available',
  area_id          uuid        REFERENCES areas(id) ON DELETE SET NULL,
  current_order_id uuid,
  assigned_captain text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON restaurant_tables (status);

-- ============================================================
-- Orders
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             text,                     -- human ID e.g. "ORD-20240101-XYZ"
  order_type           text,                     -- 'dine-in' | 'takeaway'
  table_no             text,                     -- matches restaurant_tables.table_number; no FK
  items_json           jsonb,                    -- embedded cart items (three runtime shapes; see diagnosis)
  subtotal             numeric     NOT NULL DEFAULT 0,
  tax                  numeric     NOT NULL DEFAULT 0,
  discount             numeric     NOT NULL DEFAULT 0,
  total                numeric     NOT NULL DEFAULT 0,
  status               text        NOT NULL DEFAULT 'new',
  source               text,                     -- 'POS' | 'Tabletot'
  customer_name        text,
  special_instructions text,
  created_by           uuid,                     -- auth.users.id
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_table_no   ON orders (table_no);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);

-- Wire the deferred FK now that orders exists
ALTER TABLE restaurant_tables
  ADD CONSTRAINT fk_restaurant_tables_current_order
    FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- ============================================================
-- KOT tickets (kitchen display + print)
-- ============================================================

CREATE TABLE IF NOT EXISTS kot_tickets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        REFERENCES orders(id) ON DELETE CASCADE,
  kot_number    text,
  table_number  text,
  items         jsonb,      -- array of { name, quantity, notes, variants?, addons? }
  status        text        NOT NULL DEFAULT 'pending',  -- pending|preparing|ready|completed
  printed_at    timestamptz NOT NULL DEFAULT now(),
  special_notes text,
  created_by    uuid,       -- auth.users.id
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kot_tickets_order_id ON kot_tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_kot_tickets_status   ON kot_tickets (status);

-- ============================================================
-- Order items (simple POS.tsx entry — flat, text-keyed, no FK)
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   text,       -- human text order_id (NOT uuid); no FK by design
  item_id    text,       -- menu_items.item_id short text key; no FK by design
  item_name  text,
  qty        integer     NOT NULL DEFAULT 1,
  line_total numeric     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Order history (completed-order archive; orders rows deleted after payment)
-- ============================================================

CREATE TABLE IF NOT EXISTS order_history (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id    uuid,       -- was orders.id before deletion; no live FK
  order_id             text,       -- human-readable order ID
  order_type           text,
  table_no             text,
  customer_name        text,
  items_json           jsonb,      -- copied verbatim from orders.items_json at payment time
  subtotal             numeric     NOT NULL DEFAULT 0,
  tax                  numeric     NOT NULL DEFAULT 0,
  discount             numeric     NOT NULL DEFAULT 0,
  total                numeric     NOT NULL DEFAULT 0,
  special_instructions text,
  source               text,
  payment_method       text,
  amount_paid          numeric     NOT NULL DEFAULT 0,
  tips                 numeric     NOT NULL DEFAULT 0,
  created_by           uuid,
  order_created_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Payments
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        REFERENCES orders(id) ON DELETE SET NULL,
  payment_method text,
  amount         numeric     NOT NULL DEFAULT 0,
  tips           numeric     NOT NULL DEFAULT 0,
  status         text        NOT NULL DEFAULT 'completed',
  created_by     uuid,       -- auth.users.id
  created_at     timestamptz NOT NULL DEFAULT now()
);
