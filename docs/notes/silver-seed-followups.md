# Silver Specialty Coffee — Seed Follow-ups

Two things to address before the Silver deployment is fully clean.

---

## 1. Fix the dangling pairing before applying 0010

`0010_silver_pairings_anchors.sql` seeds 32 item pairings instead of the intended 33. The missing one is:

| Source | Intended target | Problem |
|---|---|---|
| Veggie (Sandwiches) | Silver Cold Brew | HTML pairings array references id `"cold-brew"`, which does not exist in menuItems — the live item id is `"silver-cold-brew"` |

**What to do:** Before running `0010`, open the file and add the row back into the pairings VALUES block:

```sql
('Veggie', 'Silver Cold Brew', 1),
```

Place it in the Sandwiches section where the comment currently reads:

```sql
-- 'Veggie' → 'cold-brew' omitted; see file header note
```

After the fix, the expected count in `validate_silver_seed.sql` query 3 changes from 32 → 33.

The migration comment already flags the spot, so it is easy to find with a quick search for `cold-brew`.

---

## 2. Verify resolver uses (restaurant_id, name) together — not name alone

Several Silver menu items have very short, category-scoped names: `"Berry"`, `"Cacao"`, `"Original"`, `"Banana"`, `"Veggie"`, `"Chicken"`, `"Mushroom"`. These are unambiguous within Silver's menu but will collide with common item names at any second restaurant added later.

The DB unique index added in `0009` is `(restaurant_id, name)`, so there is no schema-level conflict. The question is whether the order-engine resolver queries `menu_items` with `restaurant_id` in the WHERE clause or just on `name`.

**Where to check:** `services/order-engine/src/loader.py` — look at the query or DataFrame filter used to load items. If it filters on `restaurant_id` before building the name index, matching is safe. If it loads all rows and builds a name-only lookup dict, a second restaurant with a `"Chicken"` item would cause silent cross-restaurant mismatches.

**Expected fix if needed:** Add `WHERE restaurant_id = :restaurant_id` to the loader query (or the equivalent pandas/dict filter) so the resolver's name index is always restaurant-scoped.

This is low-risk for the Silver pilot since only one restaurant will be live, but it is the right thing to harden before onboarding restaurant #2.
