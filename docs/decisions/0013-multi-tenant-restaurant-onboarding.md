---
status: accepted
date: 2026-05-30
tags: [architecture, multi-tenancy, database]
---

# 0013 — Multi-tenant restaurant onboarding without hardcoded migrations

## Context
For Pilot 1 (Silver Specialty Coffee), we pinned the restaurant UUID to `b22b5d53-6dd8-4f5b-8276-2e828cd1ab91` in migration `0014` to avoid developer friction during local database resets. 

However, hardcoding client UUIDs or configuration parameters (like default `restaurant_id` database columns) in SQL migrations is an anti-pattern. As we onboard our second restaurant (e.g., Sozo Cakery), this model breaks down. It couples structural database updates to specific customers, prevents self-serve onboarding from the POS portal, and poses severe security risks like tenant data leakage.

## Decision
We will separate core structural migrations (DDL) from restaurant seed/operational data (DML). To scale to multi-site onboarding, we will implement the following three standards:

### 1. Zero-Hardcoding Database Schema
* Core migrations (`supabase/migrations/*.sql`) must contain **only** table definitions, column types, and constraints. No specific restaurant names or UUIDs are allowed.
* Specific restaurant profiles, menus, and tables must be created via **DML seed scripts** (`supabase/seed.sql`) or through the POS administrative dashboard.
* Remove the hardcoded fallback defaults on columns (like `restaurant_tables.restaurant_id` defaulting to Silver's UUID) before public multi-tenant deployment.

### 2. Dynamic Frontend Tenant Resolution
* We will retire the build-time static environment variable `VITE_RESTAURANT_ID`.
* The kiosk and POS applications will resolve their active `restaurant_id` dynamically at runtime.
  * **Kiosk**: Resolves tenant by extracting the domain hostname (e.g., `sozo-cakery.tabletot.app` maps to the `slug = 'sozo-cakery'` database entry).
  * **POS**: Resolves tenant using the logged-in user's account context (fetched after authentication).

### 3. Row-Level Security (RLS) Tenant Isolation
We will enforce data isolation using Supabase JWT claims. When a staff member is created in `auth.users`, they will be assigned a `restaurant_id` in their user metadata. Our RLS policies will enforce that staff can only query or mutate rows matching their home restaurant:

```sql
CREATE POLICY "staff_tenant_isolation" ON public.restaurant_tables
  FOR ALL
  TO authenticated
  USING (restaurant_id = (auth.jwt() -> 'app_metadata' ->> 'restaurant_id')::uuid)
  WITH CHECK (restaurant_id = (auth.jwt() -> 'app_metadata' ->> 'restaurant_id')::uuid);
```

## Alternatives considered
* **Dedicated Database Instances (One project per tenant)**: Rejected because managing schema migrations across multiple physical databases is highly complex at scale, and the cost of maintaining separate running containers on Supabase/Railway would destroy our margins.
* **Global POS Tenant Dropdown**: Rejected. POS staff must never be asked to manually select their restaurant on login, as this is prone to human error and exposes the existence of other tenants.

## Consequences
* **What gets easier**: Onboarding a new restaurant requires zero code deploys or migration runs. It is entirely self-serve via database inserts.
* **What gets harder**: The local development setup requires slightly more coordination (e.g., setting up local host alias maps like `silver.localhost` and `sozo.localhost` to test dynamic routing).
* **Security**: Multi-tenant isolation becomes load-bearing. Robust testing of our RLS policies is required before production scale-out.
