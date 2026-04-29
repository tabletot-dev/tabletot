-- 0001_pos_initial.sql
-- Initial POS schema: menu, restaurant tables, orders, KOTs.
-- Derived from apps/pos TypeScript types + menu.json (roast-ccx-hyd.json).
-- No RLS, no seed data. Applied via: supabase migration up (Beat 3).

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE item_type AS ENUM ('simple', 'variant_group');
CREATE TYPE order_status AS ENUM ('open', 'paid', 'cancelled');
CREATE TYPE kot_status AS ENUM ('pending', 'preparing', 'ready', 'served');
CREATE TYPE table_status AS ENUM ('available', 'occupied', 'bill_requested');

-- ============================================================
-- Menu: categories
-- ============================================================
-- Derived from: menu.json .categories[], models.py Category dataclass.
-- available_from/until/days mirror the time-window fields used by the order engine.

CREATE TABLE categories (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  sort_order      integer     NOT NULL DEFAULT 0,
  available_from  text,                     -- "07:00"
  available_until text,                     -- "11:00"
  available_days  text[],                   -- ["mon","tue",...]
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Menu: items
-- ============================================================
-- Derived from: apps/pos MenuItem interface + menu.json .items[].
-- price is NULL for variant_group rows (price lives on item_variants children).
-- tags, modifiers, serves come from menu.json and models.py; not in the current
-- apps/pos MenuItem interface but required for seeding the real Roast CCx menu.

CREATE TABLE menu_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid        NOT NULL REFERENCES categories(id),
  name         text        NOT NULL,
  description  text,
  price        numeric,                    -- NULL for variant_group
  type         item_type   NOT NULL DEFAULT 'simple',
  tags         text[]      NOT NULL DEFAULT '{}',
  modifiers    jsonb,                      -- modifier defs; see order-engine models.py MenuItem.modifiers
  serves       integer,                    -- e.g. 2 for "High Tea (Serves 2)"
  image_url    text,
  is_available boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON menu_items (category_id);
CREATE INDEX ON menu_items (is_available);

-- ============================================================
-- Menu: item variants
-- ============================================================
-- AMBIGUOUS: apps/pos ItemDetailScreen has no variant picker — it renders a flat
-- "Add to Order" button with no customisation step. Tables included because
-- menu.json has 66 variant children across 22 variant_group parents, and the
-- order engine resolves them. Assumed the kiosk gains a variant selection modal
-- before going live with the real Roast CCx menu.

CREATE TABLE item_variants (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_item_id uuid        NOT NULL REFERENCES menu_items(id),
  name           text        NOT NULL,
  price          numeric     NOT NULL,
  tags           text[]      NOT NULL DEFAULT '{}',
  is_available   boolean     NOT NULL DEFAULT true,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON item_variants (parent_item_id);

-- ============================================================
-- Menu: add-on groups, category mappings, and options
-- ============================================================
-- AMBIGUOUS: No addon UI exists in apps/pos. menu.json has exactly one addon
-- group ("Pasta Add-Ons") that applies to the "pasta" category. Tables included
-- for menu completeness — assumed the kiosk will prompt for add-ons when an item
-- from an applicable category is added to the cart.

CREATE TABLE addon_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addon_group_categories (
  addon_group_id uuid NOT NULL REFERENCES addon_groups(id),
  category_id    uuid NOT NULL REFERENCES categories(id),
  PRIMARY KEY (addon_group_id, category_id)
);

CREATE TABLE addon_options (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_group_id uuid        NOT NULL REFERENCES addon_groups(id),
  name           text        NOT NULL,
  price          numeric     NOT NULL,
  is_available   boolean     NOT NULL DEFAULT true,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON addon_options (addon_group_id);

-- ============================================================
-- Restaurant tables
-- ============================================================
-- AMBIGUOUS: No table_id or table_number field appears in any apps/pos TypeScript
-- type. The kiosk is a per-table device; a table FK on orders is the natural shape.
-- Assumed each physical tablet maps to one restaurant_tables row (set up in seed data,
-- Beat 3 or later).

CREATE TABLE restaurant_tables (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text         NOT NULL UNIQUE,
  status       table_status NOT NULL DEFAULT 'available',
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

-- ============================================================
-- Orders
-- ============================================================
-- Derived from: useDeviceNavigation.ts (previousOrders array = multiple rounds
-- tracked per session). One orders row = one table session from seating to payment.
-- status 'open' while the session is active; set to 'paid'/'cancelled' at close.

CREATE TABLE orders (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid         NOT NULL REFERENCES restaurant_tables(id),
  status     order_status NOT NULL DEFAULT 'open',
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX ON orders (table_id);
CREATE INDEX ON orders (status);

-- ============================================================
-- Kitchen Order Tickets (KOTs)
-- ============================================================
-- Derived from: OrderRound type + confirmOrder() in useDeviceNavigation.ts.
-- Each "Confirm Order" tap creates one KOT row. BillSummaryScreen renders them
-- as "Order #1", "Order #2", etc. — that's round_number.
-- total is stored (not computed) so the bill screen reads one row per KOT.

CREATE TABLE kots (
  id           uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid       NOT NULL REFERENCES orders(id),
  round_number integer    NOT NULL DEFAULT 1,
  status       kot_status NOT NULL DEFAULT 'pending',
  total        numeric    NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON kots (order_id);

-- ============================================================
-- KOT line items
-- ============================================================
-- Derived from: OrderItem (MenuItem + quantity) in useDeviceNavigation.ts.
-- item_name and unit_price are snapshotted at confirm time — menu price changes
-- must not retroactively alter historical KOTs.
-- menu_item_id: always set (the item or variant_group that was ordered).
-- AMBIGUOUS: variant_id is NULL for all orders from the current apps/pos (MenuItem
-- has no variant_id field and ItemDetailScreen has no variant picker). Column
-- included for when variant selection is added; when set, menu_item_id points to
-- the parent variant_group row and variant_id points to the chosen child.

CREATE TABLE kot_items (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  kot_id       uuid    NOT NULL REFERENCES kots(id),
  menu_item_id uuid    NOT NULL REFERENCES menu_items(id),
  variant_id   uuid    REFERENCES item_variants(id),
  item_name    text    NOT NULL,
  unit_price   numeric NOT NULL,
  quantity     integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON kot_items (kot_id);
