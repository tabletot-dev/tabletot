# Restaurants Table & Multi-Restaurant Scoping

Added in migration `0007_restaurants_and_scoping.sql`.

## Roast CCx UUID

```
cccccccc-cccc-cccc-cccc-cccccccccccc
```

Use this UUID when querying or inserting rows scoped to the pilot restaurant.

## Tables that received `restaurant_id`

All domain tables now carry a `restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE`:

- `menu_items`
- `item_pairings`
- `anchor_items`
- `meal_completion_rules`
- `recommendation_events`
- `orders`
- `kot_tickets`
- `restaurant_tables`

The column is nullable for now (no `NOT NULL` constraint) to allow backfilling existing rows. `seed.sql` backfills every pre-existing row to Roast CCx.

## Adding a second restaurant

1. Insert a row into `restaurants`:
   ```sql
   INSERT INTO restaurants (id, name, pos_provider)
   VALUES (gen_random_uuid(), 'New Restaurant Name', 'tabletot');
   ```
2. Add its UUID to any environment config that needs it (e.g. `VITE_RESTAURANT_ID`).
3. All data inserts for that restaurant must include its `restaurant_id`.
4. Queries scoped to a restaurant should filter `WHERE restaurant_id = $restaurantId`.
