-- 0068_staff_role_gated_rls.sql
--
-- Fix (2026-08-28 pre-deployment audit, finding 2, part 1 of 3 — see
-- docs/notes/2026-08-28-pre-deployment-code-audit.md). 0022's staff-facing
-- RLS policies check only `TO authenticated` — logged in at all, not
-- authorized for anything. Combined with the public POS Sign Up tab and
-- handle_new_user() (0040) auto-granting every new signup 'staff', that
-- meant anyone who found the POS URL could register and immediately
-- settle bills, void orders, or rewrite menu prices.
--
-- This migration closes the DB-level half of that hole: new signups now
-- default to a 'pending' role with no operational privileges, and every
-- staff-facing write/read policy checks real role membership instead of
-- bare authentication. Parts 2-3 (client-side least-privilege default,
-- an admin-facing approval screen, and a programmatic per-restaurant
-- bootstrap admin) land in separate commits — this migration is the part
-- that actually enforces the boundary at the database.
--
-- Design notes:
--   * is_authorized_staff() is SECURITY DEFINER so it can read user_roles
--     regardless of the calling user's own row-level visibility into that
--     table (same pattern as append_event/handle_new_user elsewhere).
--   * user_roles itself is special-cased: a pending user can still read
--     their OWN row (own_read, so the client can show "waiting for
--     approval" instead of erroring) via a separate permissive policy,
--     while writes stay gated to already-authorized staff — Postgres RLS
--     evaluates multiple permissive policies for the same command as OR,
--     so adding own_read doesn't loosen staff_only's write gate.
--   * recommendation_events is skipped — dropped in migration 0051, its
--     0022 policies are already gone with the table.
--   * anon-facing policies (anon_read/anon_insert/anon_update) are
--     untouched: the kiosk's unauthenticated write paths are a separate,
--     already-reviewed concern (append_event is SECURITY DEFINER and
--     bypasses RLS for the ledger; direct anon inserts are scoped to
--     specific columns/tables by design, e.g. bill_requests/table_requests).

-- ============================================================
-- Role model
-- ============================================================

ALTER TABLE user_roles
  ALTER COLUMN role SET DEFAULT 'pending';

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('pending', 'staff', 'manager', 'admin'));

CREATE OR REPLACE FUNCTION is_authorized_staff(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id AND role IN ('staff', 'manager', 'admin')
  );
$$;

-- handle_new_user (0040): stop auto-granting 'staff'. A fresh signup now
-- gets 'pending' explicitly (belt-and-suspenders with the column default
-- above) and has zero write access anywhere until an admin promotes them.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'v2 (0068): new signups default to role=pending, not staff — see 0068 header.';

-- ============================================================
-- Tighten staff-facing policies to real role membership
-- ============================================================

-- Catalog tables + order/session tables + kot_tickets: FOR ALL "staff_write".
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'restaurants','menu_items','menu_categories','item_variants','item_addons',
    'item_pairings','anchor_items','meal_completion_rules','menu_item_aliases',
    'discount_types','areas','restaurant_tables',
    'orders','order_items','sessions','bill_requests','table_requests',
    'kot_tickets'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff_write" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "staff_write" ON public.%I FOR ALL TO authenticated USING (is_authorized_staff(auth.uid())) WITH CHECK (is_authorized_staff(auth.uid()))',
      t
    );
  END LOOP;
END $$;

-- voice_turns: FOR SELECT "staff_read" + FOR ALL "staff_modify".
DROP POLICY IF EXISTS "staff_read" ON public.voice_turns;
CREATE POLICY "staff_read" ON public.voice_turns
  FOR SELECT TO authenticated USING (is_authorized_staff(auth.uid()));
DROP POLICY IF EXISTS "staff_modify" ON public.voice_turns;
CREATE POLICY "staff_modify" ON public.voice_turns
  FOR ALL TO authenticated USING (is_authorized_staff(auth.uid())) WITH CHECK (is_authorized_staff(auth.uid()));

-- table_events (0057) + kiosk_events (0041): FOR SELECT "staff_read".
DROP POLICY IF EXISTS "staff_read" ON public.table_events;
CREATE POLICY "staff_read" ON public.table_events
  FOR SELECT TO authenticated USING (is_authorized_staff(auth.uid()));
DROP POLICY IF EXISTS "staff_read" ON public.kiosk_events;
CREATE POLICY "staff_read" ON public.kiosk_events
  FOR SELECT TO authenticated USING (is_authorized_staff(auth.uid()));

-- profiles: tighten "staff_read" (own_read/own_update stay exactly as 0022
-- defined them — a pending user must still be able to see/edit their own
-- profile).
DROP POLICY IF EXISTS "staff_read" ON public.profiles;
CREATE POLICY "staff_read" ON public.profiles
  FOR SELECT TO authenticated USING (is_authorized_staff(auth.uid()));

-- Staff-only tables except user_roles (handled below): FOR ALL "staff_only".
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payments','order_history','staff','restaurant_settings','external_id_mapping'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff_only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "staff_only" ON public.%I FOR ALL TO authenticated USING (is_authorized_staff(auth.uid())) WITH CHECK (is_authorized_staff(auth.uid()))',
      t
    );
  END LOOP;
END $$;

-- user_roles: special-cased (see header). Tighten staff_only's write gate,
-- add own_read so a pending user can still see their own row.
DROP POLICY IF EXISTS "staff_only" ON public.user_roles;
CREATE POLICY "staff_only" ON public.user_roles
  FOR ALL TO authenticated USING (is_authorized_staff(auth.uid())) WITH CHECK (is_authorized_staff(auth.uid()));
DROP POLICY IF EXISTS "own_read" ON public.user_roles;
CREATE POLICY "own_read" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
