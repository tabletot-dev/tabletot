# POS table diagnosis for schema rewrite

**Date:** 2026-04-29  
**Scope:** Every file under `apps/pos/src/` that imports from `@/integrations/supabase/client`  
or calls `.from()` / `.auth.*` / `.functions.invoke()`.  
**Purpose:** Ground truth for the schema migration that replaces 0001 with a schema  
the actual POS code can run against.

---

## Files that touch Supabase (18 total)

| File | Tables touched |
|------|----------------|
| `contexts/AuthContext.tsx` | `user_roles`, `profiles`; `.auth.*` |
| `pages/Kitchen.tsx` | `kot_tickets` |
| `pages/POS.tsx` | `menu_items`, `orders`, `order_items` |
| `pages/Billing.tsx` | `orders`, `menu_items`, `restaurant_tables`, `kot_tickets` |
| `pages/Orders.tsx` | `orders` |
| `pages/Reports.tsx` | `orders` |
| `pages/Dashboard.tsx` | `orders`, `restaurant_tables` |
| `pages/Menu.tsx` | `menu_items` |
| `pages/AdminMenuItems.tsx` | `menu_items`, `menu_categories` |
| `pages/AdminCategories.tsx` | `menu_categories` |
| `pages/TableManagement.tsx` | `restaurant_tables`, `areas` |
| `pages/StaffManagement.tsx` | `staff` |
| `components/billing/TableSelector.tsx` | `restaurant_tables`, `orders` |
| `components/billing/MenuGrid.tsx` | `menu_items` |
| `components/billing/ItemVariantModal.tsx` | `item_variants`, `item_addons` |
| `components/billing/CaptainAssignModal.tsx` | `staff`, `restaurant_tables` |
| `components/billing/DiscountModal.tsx` | `discount_types` |
| `components/billing/PaymentModal.tsx` | `orders`, `order_history`, `payments`, `restaurant_tables` |
| `components/billing/POSLayout.tsx` | `menu_categories`, `menu_items`, `orders`, `kot_tickets`, `restaurant_tables` |
| `components/billing/SettleBillModal.tsx` | `payments`, `orders`, `restaurant_tables` |

Files with no Supabase: `CartSummary.tsx`, `KOTView.tsx`, `OrderDetails.tsx`,
`Settings.tsx`, `Auth.tsx` (delegates to `AuthContext`).

---

## Table inventory

Every table referenced by a `.from('...')` call, with all columns observed across all
call sites, insert payloads, and TypeScript interfaces.

---

### `areas`

**Referenced in:** `TableManagement.tsx`  
**Operations:** SELECT

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | SELECT result |
| `name` | text | displayed in UI |
| `is_active` | boolean | `.eq('is_active', true)` filter |

**TypeScript interface:**
```typescript
interface Area { id: string; name: string; }
```

---

### `discount_types`

**Referenced in:** `DiscountModal.tsx`  
**Operations:** SELECT (list active coupons), SELECT (lookup by coupon code)

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | SELECT result |
| `name` | text | displayed in UI |
| `discount_type` | text (`'coupon'` \| `'percentage'` \| `'flat'`) | filter + display |
| `coupon_code` | text | `.eq('coupon_code', ...)` filter |
| `value` | numeric | discount calculation |
| `min_order_value` | numeric | validation check |
| `max_discount` | numeric \| null | cap calculation |
| `is_active` | boolean | `.eq('is_active', true)` filter |
| `valid_until` | timestamptz | `.gte('valid_until', now)` filter |

**TypeScript interface:** none (accessed as `any`)

---

### `item_addons`

**Referenced in:** `ItemVariantModal.tsx`  
**Operations:** SELECT

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | SELECT result |
| `menu_item_id` | uuid | `.eq('menu_item_id', item.id)` filter (FK to `menu_items.id`) |
| `addon_name` | text | displayed, sent to cart |
| `price` | numeric | cart price calculation |
| `is_available` | boolean | `.eq('is_available', true)` filter |

**TypeScript interface:**
```typescript
interface Addon {
  id: string;
  addon_name: string;
  price: number;
}
```

> **Conflict with 0001:** Migration 0001 has `addon_options` (different table name,
> different columns: `name` not `addon_name`, no `menu_item_id` FK, linked via
> `addon_groups` + `addon_group_categories`). The POS code bypasses that entirely.

---

### `item_variants`

**Referenced in:** `ItemVariantModal.tsx`  
**Operations:** SELECT

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | SELECT result |
| `menu_item_id` | uuid | `.eq('menu_item_id', item.id)` filter (FK to `menu_items.id`) |
| `variant_type` | text | grouping key (e.g., `'size'`, `'spice'`) |
| `variant_name` | text | displayed in UI |
| `price_modifier` | numeric | added to base price |
| `is_default` | boolean | pre-select default variant per type |

**TypeScript interface:**
```typescript
interface Variant {
  id: string;
  variant_type: string;
  variant_name: string;
  price_modifier: number;
}
```

> **Conflict with 0001:** Migration 0001 defines `item_variants` with `parent_item_id`
> (not `menu_item_id`), `name` (not `variant_name`), `price` (not `price_modifier`),
> `tags`, `sort_order` — and no `variant_type` or `is_default`. The column shapes are
> entirely different.

---

### `kot_tickets`

**Referenced in:** `Kitchen.tsx`, `Billing.tsx`, `POSLayout.tsx`  
**Operations:** SELECT, INSERT, UPDATE

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | SELECT result; Realtime subscription |
| `order_id` | uuid | INSERT; FK to `orders.id` |
| `kot_number` | text | INSERT + displayed (e.g., `"KOT-1234567890"`) |
| `table_number` | text | INSERT + displayed |
| `items` | jsonb | INSERT + iterated in display |
| `status` | text | SELECT filter; UPDATE target; values: `pending`, `preparing`, `ready`, `completed` |
| `printed_at` | timestamptz | displayed (`getTimeSince`) — set by DB default |
| `special_notes` | text \| null | INSERT + displayed |
| `created_by` | uuid \| null | INSERT; FK to auth.users |

**JSONB `items` — element shape** (from `Billing.tsx` + `POSLayout.tsx` inserts,
confirmed by `Kitchen.tsx` display and `KOTView.tsx` render):
```typescript
{
  name: string;
  quantity: number;
  notes: string;          // empty string when absent
  variants?: Array<{ name: string }>;   // rendered in KOTView
  addons?: Array<{ name: string }>;     // rendered in KOTView
}
```

**INSERT payload** (from `Billing.tsx:295` and `POSLayout.tsx:313`):
```typescript
{
  order_id: string,        // uuid FK
  kot_number: string,      // "KOT-{timestamp}"
  table_number: string,
  items: KOTItem[],        // jsonb array above
  status: 'pending',
  created_by: string,      // user uuid
  special_notes?: string,
}
```

**TypeScript interface:**
```typescript
interface KOTTicket {
  id: string;
  kot_number: string;
  table_number: string | null;
  items: any;              // array — typed as any throughout
  status: string;
  printed_at: string;
  special_notes: string | null;
}
```

> **Conflict with 0001:** 0001 has `kots` + `kot_items` (two normalised tables).
> The POS exclusively uses `kot_tickets` (one flat table, items embedded as jsonb).
> `kots` and `kot_items` are never referenced by any POS file.

---

### `menu_categories`

**Referenced in:** `AdminCategories.tsx`, `AdminMenuItems.tsx`, `POSLayout.tsx`  
**Operations:** SELECT, INSERT, UPDATE, DELETE

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | PK; referenced in category dropdown |
| `name` | text | displayed; used as category filter key |
| `description` | text \| null | edit form |
| `display_order` | integer | `.order('display_order')` |
| `is_active` | boolean | `.eq('is_active', true)` filter |

**INSERT payload** (from `AdminCategories.tsx:99`):
```typescript
{
  name: string,
  description: string | null,
  display_order: number,
  is_active: boolean,
}
```

**TypeScript interface:**
```typescript
interface Category {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}
```

> **Conflict with 0001:** 0001 has `categories` with `available_from`, `available_until`,
> `available_days` (time-window fields for the order engine). The POS code never reads
> `categories`; it reads `menu_categories`, which has `display_order` and `is_active`
> instead. Two separate tables serving different consumers.

---

### `menu_items`

**Referenced in:** `POS.tsx`, `Billing.tsx`, `Menu.tsx`, `AdminMenuItems.tsx`,
`MenuGrid.tsx`, `POSLayout.tsx`  
**Operations:** SELECT, INSERT, UPDATE, DELETE

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | PK |
| `item_id` | text | short ID (`"ITEM-001"`, auto-generated); used as FK target in `order_items` |
| `item_name` | text | all display and form fields |
| `category` | text | plain text, not a FK; used as grouping key |
| `price` | numeric | cart calculations |
| `description` | text \| null | item card display |
| `image_url` | text \| null | optional thumbnail |
| `is_available` | boolean | SELECT filter; toggle in admin |

**INSERT payload** (from `Menu.tsx:91` and `AdminMenuItems.tsx:156`):
```typescript
{
  item_id: string,          // "ITEM-{timestamp36}" or user-supplied
  item_name: string,
  price: number,
  category: string,         // plain text, no FK
  description: string | null,
  is_available: boolean,
  image_url?: string | null,
}
```

**TypeScript interfaces:**
```typescript
// POS.tsx / MenuGrid.tsx
interface MenuItem {
  id: string;
  item_id: string;
  item_name: string;
  price: number;
  category: string;
  is_available: boolean;
}

// AdminMenuItems.tsx
interface MenuItem {
  id: string;
  item_id: string;
  item_name: string;
  category: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_available: boolean;
}

// Menu.tsx
interface MenuItem {
  id: string;
  item_id: string;
  item_name: string;
  price: number;
  category: string;
  description: string | null;
  is_available: boolean;
}
```

> **Conflict with 0001:** 0001's `menu_items` uses `name` (not `item_name`),
> `category_id uuid FK` (not `category text`), and has `type` (item_type enum),
> `tags`, `modifiers`, `serves`, `sort_order` — none of which the POS code reads.
> The POS also adds `item_id` (a short text business key) that 0001 doesn't have.

---

### `order_history`

**Referenced in:** `PaymentModal.tsx`  
**Operations:** INSERT (payment archival)

**Columns observed / INSERT payload:**

```typescript
{
  original_order_id: string,    // uuid — FK to orders.id
  order_id: string,             // text — human-readable order ID
  order_type: string,
  table_no: string | null,
  customer_name: string | null,
  items_json: Json,             // same jsonb structure as orders.items_json
  subtotal: number,
  tax: number,
  discount: number,
  total: number,
  special_instructions: string | null,
  source: string | null,
  payment_method: string,       // 'cash' | 'card' | 'upi'
  amount_paid: number,
  tips: number,
  created_by: string,           // user uuid
  order_created_at: string,     // ISO timestamp — copied from orders.created_at
}
```

**TypeScript interface:** none (payload built inline)

> Not in 0001. This is the completed-order archive; `orders` rows are deleted after
> payment and the record lives here permanently.

---

### `order_items`

**Referenced in:** `POS.tsx` (the simpler order-entry page, not the main Billing flow)  
**Operations:** INSERT

**INSERT payload** (from `POS.tsx:144`):
```typescript
{
  order_id: string,     // text — the human order_id string (e.g. "ORD-1234567890"),
                        //         NOT the uuid orders.id
  item_id: string,      // text — menu_items.item_id
  item_name: string,
  qty: number,
  line_total: number,
}
```

**TypeScript interface:** none (payload built inline)

> Not in 0001. Used only by `POS.tsx` (the simple POS page). The primary `Billing.tsx`
> flow embeds items in `orders.items_json` instead and never touches this table.

---

### `orders`

**Referenced in:** `POS.tsx`, `Billing.tsx`, `Orders.tsx`, `Reports.tsx`,
`Dashboard.tsx`, `TableSelector.tsx`, `PaymentModal.tsx`, `POSLayout.tsx`,
`SettleBillModal.tsx`  
**Operations:** SELECT, INSERT, UPDATE, DELETE

**Columns observed (union of all call sites):**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | PK; returned by `.select().single()` after insert |
| `order_id` | text | human ID, e.g. `"ORD-20240101-XYZ"` or `"T5-1234567"` |
| `order_type` | text | `'dine-in'` \| `'takeaway'` |
| `table_no` | text \| null | plain table number, **no FK** |
| `items_json` | jsonb | embedded cart items |
| `subtotal` | numeric | |
| `tax` | numeric | |
| `discount` | numeric | |
| `total` | numeric | |
| `status` | text | `new` \| `preparing` \| `ready` \| `served` \| `completed` \| `paid` \| `cancelled` \| `draft` |
| `source` | text \| null | `'POS'` \| `'Tabletot'` |
| `customer_name` | text \| null | |
| `created_by` | uuid \| null | FK to auth.users |
| `special_instructions` | text \| null | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**JSONB `items_json` — three shapes in the wild:**

*From `POS.tsx` (simple order entry):*
```typescript
{ item_id: string; item_name: string; qty: number; price: number; line_total: number; }
```

*From `Billing.tsx` (full cart):*
```typescript
{
  id: string;           // local cart uuid
  menu_item_id: string; // menu_items.id
  name: string;
  price: number;
  quantity: number;
  variants: Array<{ type: string; name: string; price: number }>;
  addons: Array<{ name: string; price: number }>;
  notes: string;
  total: number;
}
```

*From `POSLayout.tsx` (inline POS billing):*
```typescript
{
  id: string;
  menu_item_id: string;
  item_id: string;       // menu_items.item_id (short text key)
  name: string;
  price: number;
  quantity: number;
  notes: string;
  total: number;
}
```

> The three shapes are written by different code paths and read back via `as unknown as
> any[]` — no runtime shape enforcement. `Orders.tsx` display handles `item.qty` vs
> `item.quantity` and `item.item_name` vs `item.name` defensively.

**INSERT payload** (canonical — from `POSLayout.tsx:212`):
```typescript
{
  order_id: string,
  order_type: 'dine-in' | 'takeaway',
  table_no: string | null,
  items_json: object[],  // jsonb
  subtotal: number,
  tax: number,
  discount: number,
  total: number,
  status: string,        // 'draft' | 'preparing' | 'new'
  source: 'POS',
  created_by: string,    // user uuid
}
```

**TypeScript interfaces:**
```typescript
// Orders.tsx
interface Order {
  id: string;
  order_id: string;
  order_type: string;
  table_no: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  items_json: Json;
  created_at: string;
  source: string | null;
}

// Billing.tsx
interface ExistingOrder {
  id: string;
  order_id: string;
  table_no: string;
  items_json: any;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: string;
  special_instructions: string | null;
  customer_name: string | null;
  created_at: string;
}
```

> **Conflict with 0001:** 0001's `orders` has `table_id uuid FK` (not `table_no text`),
> status enum `(open, paid, cancelled)` (not the 8 free-text values above), and no
> `items_json`, `subtotal`, `tax`, `discount`, `source`, `customer_name`,
> `special_instructions`, or `order_id` columns.

---

### `payments`

**Referenced in:** `PaymentModal.tsx`, `SettleBillModal.tsx`  
**Operations:** INSERT

**Columns observed / INSERT payloads:**

From `PaymentModal.tsx:84`:
```typescript
{
  order_id: string,       // uuid FK to orders.id
  payment_method: string, // 'cash' | 'card' | 'upi'
  amount: number,
  tips: number,
  status: 'completed',
  created_by: string,     // user uuid
}
```

From `SettleBillModal.tsx:71` (same, minus `created_by`):
```typescript
{
  order_id: string,
  amount: number,
  payment_method: string,
  tips: number,
  status: 'completed',
}
```

> Not in 0001.

---

### `profiles`

**Referenced in:** `AuthContext.tsx`  
**Operations:** INSERT (on sign-up)

**INSERT payload:**
```typescript
{
  id: string,        // same as auth.users.id
  email: string,
  full_name: string,
}
```

> Not in 0001. Supabase Auth auto-populates `auth.users`; this table stores the
> display profile.

---

### `restaurant_tables`

**Referenced in:** `Billing.tsx`, `Dashboard.tsx`, `TableManagement.tsx`,
`TableSelector.tsx`, `CaptainAssignModal.tsx`, `PaymentModal.tsx`,
`POSLayout.tsx`, `SettleBillModal.tsx`  
**Operations:** SELECT, INSERT, UPDATE, DELETE

**Columns observed (union of all call sites):**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | PK |
| `table_number` | text | displayed; used as text join key against `orders.table_no` |
| `capacity` | integer | TableManagement + TableSelector display |
| `status` | text | values: `available`, `free`, `occupied`, `ordering`, `preparing`, `billing`, `paid`, `reserved`, `cleaning` |
| `area_id` | uuid \| null | FK to `areas.id`; TableManagement form |
| `current_order_id` | uuid \| null | FK to `orders.id`; set on KOT print; cleared on payment |
| `assigned_captain` | text \| null | FK to `staff.user_id`; set by CaptainAssignModal |
| `updated_at` | timestamptz | explicitly set in PaymentModal update |

**UPDATE payloads (three patterns):**

KOT print — occupy table:
```typescript
{ status: 'occupied', current_order_id: orderId }
```

Payment complete — free table:
```typescript
{ status: 'available', current_order_id: null, updated_at: new Date().toISOString() }
```

Assign captain:
```typescript
{ assigned_captain: staffUserId }
```

**TypeScript interfaces:**
```typescript
// TableManagement.tsx
interface RestaurantTable {
  id: string;
  table_number: string;
  capacity: number;
  status: string;
  area_id: string | null;
}

// TableSelector.tsx
interface Table {
  id: string;
  table_number: string;
  capacity: number;
  status: string;
  current_order_id: string | null;
  assigned_captain: string | null;
}
```

> **Conflict with 0001:** 0001 has only `(id, table_number, status enum, created_at,
> updated_at)`. Missing: `capacity`, `area_id`, `current_order_id`, `assigned_captain`.
> Status enum `(available, occupied, bill_requested)` covers 3 of the 9 values the code
> uses; `ordering`, `preparing`, `billing`, `paid`, `reserved`, `cleaning`, `free` are
> all absent from the enum.

---

### `staff`

**Referenced in:** `StaffManagement.tsx`, `CaptainAssignModal.tsx`  
**Operations:** SELECT, INSERT, UPDATE, DELETE

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `id` | uuid | PK |
| `user_id` | uuid | linked to auth.users; used as `assigned_captain` FK value |
| `full_name` | text | displayed |
| `role` | text | `admin` \| `manager` \| `captain` \| `chef` \| `staff` \| `waiter` |
| `phone` | text \| null | optional |
| `is_active` | boolean | SELECT filter |
| `created_at` | timestamptz | order in display |

**INSERT payload:**
```typescript
{
  user_id: string,        // uuid (crypto.randomUUID() placeholder when no auth user)
  full_name: string,
  role: string,
  phone: string | null,
  is_active: boolean,
}
```

**TypeScript interface:**
```typescript
interface StaffMember {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}
```

> Not in 0001.

---

### `user_roles`

**Referenced in:** `AuthContext.tsx`  
**Operations:** SELECT (fetch role on login), INSERT (assign role on sign-up)

**Columns observed:**

| Column | Type | Source |
|--------|------|--------|
| `user_id` | uuid | `.eq('user_id', userId)` filter; FK to auth.users |
| `role` | text | returned value; default `'staff'` on insert |

**INSERT payload:**
```typescript
{ user_id: string, role: 'staff' }
```

> Not in 0001.

---

## JSONB summary

| Table | Column | Runtime shape |
|-------|--------|---------------|
| `orders` | `items_json` | Array — three incompatible shapes depending on which code path wrote it (see `orders` section above) |
| `kot_tickets` | `items` | Array of `{ name, quantity, notes, variants?, addons? }` — consistent across all writers |
| `order_history` | `items_json` | Copied verbatim from `orders.items_json` at payment time |

---

## Tables in `types.ts` / migration 0001 vs. tables in POS code

`types.ts` was regenerated from migration 0001 at some point and matches it exactly.
Neither reflects the schema the POS code actually needs.

### Tables the POS code uses that are **absent** from 0001 and `types.ts`

| Table | Evidence |
|-------|----------|
| `kot_tickets` | Kitchen display, KOT print in Billing + POSLayout |
| `order_history` | Payment archival in PaymentModal |
| `payments` | Payment recording in PaymentModal + SettleBillModal |
| `menu_categories` | Admin categories CRUD; category sidebar in POSLayout |
| `areas` | Table management area/zone assignment |
| `order_items` | Simple order entry in POS.tsx |
| `user_roles` | Auth context role fetch + sign-up assignment |
| `profiles` | User profile insert on sign-up |
| `staff` | Staff management + captain assignment |
| `item_addons` | Item customisation modal |
| `discount_types` | Discount / coupon lookup |

### Tables in 0001 / `types.ts` that **no POS file references**

| Table | Note |
|-------|------|
| `kots` | POS uses `kot_tickets` instead |
| `kot_items` | POS embeds items as jsonb in `kot_tickets.items` |
| `categories` | POS uses `menu_categories` instead |
| `addon_groups` | POS uses `item_addons` (flat, per menu item) instead |
| `addon_group_categories` | Same — POS addon model is entirely different |
| `addon_options` | Same |

### Tables that exist in both but have incompatible column shapes

| Table | 0001 column | POS code expects |
|-------|-------------|------------------|
| `menu_items` | `name` | `item_name` |
| `menu_items` | `category_id uuid FK → categories` | `category text` (no FK) |
| `menu_items` | `type`, `tags`, `modifiers`, `serves`, `sort_order` | none of these used |
| `menu_items` | *(missing)* | `item_id text` (short business key) |
| `item_variants` | `parent_item_id` | `menu_item_id` |
| `item_variants` | `name`, `price`, `tags` | `variant_name`, `price_modifier`, `variant_type`, `is_default` |
| `orders` | `table_id uuid FK → restaurant_tables` | `table_no text` (no FK) |
| `orders` | status enum `(open, paid, cancelled)` | status text `new\|preparing\|ready\|served\|completed\|paid\|cancelled\|draft` |
| `orders` | *(missing)* | `order_id`, `order_type`, `items_json`, `subtotal`, `tax`, `discount`, `source`, `customer_name`, `special_instructions`, `created_by` |
| `restaurant_tables` | status enum `(available, occupied, bill_requested)` | status text with 9+ values |
| `restaurant_tables` | *(missing)* | `capacity`, `area_id`, `current_order_id`, `assigned_captain` |

---

## Edge Functions (still invoked — dead per ADR-0002)

| Function | Called from | Status |
|----------|-------------|--------|
| `sync-order-to-sheets` | `Billing.tsx`, `POSLayout.tsx` | Dead — retire |
| `sync-orders-from-sheets` | `Orders.tsx` | Dead — retire |
| `update-order-status-sheet` | `PaymentModal.tsx` | Dead — retire |
| `sync-tables-from-sheets` | `TableSelector.tsx` | Dead — retire |

All four are still invoked at runtime. Failures are caught and logged but not fatal.
They should be removed once the schema migration is in place.
