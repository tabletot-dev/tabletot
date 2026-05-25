---
status: accepted
date: 2026-05-08
tags: [infrastructure, database, supabase, multi-tenancy]
---

# 0006 — Single Supabase project shared across all three apps

## Context

Tabletot has three frontend apps (kiosk, POS, dashboard) and one backend
service (order-engine). All need access to overlapping data: menu items,
orders, recommendation tables, restaurant config.

Early in development the kiosk used a separate Supabase project from the
POS. This created immediate friction: syncing menu changes required manual
data duplication, and realtime order status across kiosk→POS required a
custom webhook layer.

## Decision

One Supabase project serves all apps. Tables are divided into three logical
groups by ownership, but they all live in the same Postgres schema:

- **POS-owned** — `orders`, `kot_tickets`, `restaurant_tables` (JSONB-heavy,
  shaped to match the POS app's data model)
- **Tabletot-canonical** — `restaurants`, `menu_items`, `external_id_mapping`
  (clean relational; the source of truth for recommendations)
- **Recommendation + analytics** — `item_pairings`, `anchor_items`,
  `meal_completion_rules`, `recommendation_events` (FK to canonical layer only)

Multi-tenancy is enforced at the application layer via `restaurant_id`
column on every table, not via separate schemas or projects.

## Alternatives considered

- **One Supabase project per app** — rejected. Order flow (kiosk → POS)
  requires cross-app realtime. Three projects means three billing lines,
  three connection strings, and a cross-project sync layer we'd have to
  maintain.
- **One Supabase project per restaurant** — rejected. Correct for large
  SaaS scale but operationally unmanageable for a solo developer in pilot.
  Schema migrations would need to run N times. Revisit if multi-restaurant
  scale demands it.
- **Self-hosted Postgres (no Supabase)** — rejected. Supabase gives realtime
  subscriptions, auth, and the dashboard Studio for free. The order of
  operations benefit (Rohan can inspect and edit data in Studio without
  writing SQL) is significant during pilot.

## Consequences

- All three apps share the same `VITE_SUPABASE_URL` and publishable key.
  A wrong `VITE_RESTAURANT_ID` in any app causes silent empty results across
  all pages — not a loud error. This has burned us once (dashboard was
  pointing at a placeholder UUID).
- RLS (Row Level Security) is currently disabled on all tables. This is
  acceptable for a closed pilot where only the restaurant owner and Rohan
  have credentials, but must be addressed before any public-facing
  deployment.
- Supabase Realtime is used for table status updates in the POS billing
  view. Adding more realtime subscriptions is cheap within this model.
- Migrations are append-only files in `supabase/migrations/`. Never edit
  an existing migration — always append a new one.
