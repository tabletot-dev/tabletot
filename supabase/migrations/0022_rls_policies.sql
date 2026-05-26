-- 0022_rls_policies.sql
-- Enable RLS on all public tables.
-- Three access tiers:
--   anon (kiosk, unauthenticated)  — read catalog + insert orders/sessions/events
--   authenticated (POS staff)      — full access to operational tables
--   postgres / service_role        — bypasses RLS entirely (order-engine backend)

-- ============================================================
-- CATALOG TABLES: anon read-only, staff read-write
-- ============================================================

ALTER TABLE public.restaurants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_addons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_pairings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anchor_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_completion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables    ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'restaurants','menu_items','menu_categories','item_variants','item_addons',
    'item_pairings','anchor_items','meal_completion_rules','menu_item_aliases',
    'discount_types','areas','restaurant_tables'
  ] LOOP
    EXECUTE format('CREATE POLICY "anon_read"   ON public.%I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "staff_write" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ============================================================
-- ORDER / SESSION TABLES: anon read + insert, staff full
-- ============================================================

ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_requests       ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders','order_items','sessions','bill_requests','table_requests'
  ] LOOP
    EXECUTE format('CREATE POLICY "anon_read"   ON public.%I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "anon_insert" ON public.%I FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "staff_write" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- kot_tickets: kiosk reads for kitchen status (Realtime), staff writes
ALTER TABLE public.kot_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read"   ON public.kot_tickets FOR SELECT USING (true);
CREATE POLICY "staff_write" ON public.kot_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- ANALYTICS / EVENTS: anon insert-only, staff read
-- ============================================================

ALTER TABLE public.recommendation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_turns           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert"  ON public.recommendation_events FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_read"   ON public.recommendation_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_modify" ON public.recommendation_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_insert"  ON public.voice_turns FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_read"   ON public.voice_turns FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_modify" ON public.voice_turns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- STAFF-ONLY TABLES: authenticated only
-- ============================================================

ALTER TABLE public.payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_id_mapping  ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payments','order_history','staff','user_roles',
    'restaurant_settings','external_id_mapping'
  ] LOOP
    EXECUTE format('CREATE POLICY "staff_only" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ============================================================
-- PROFILES: users manage their own row
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auth trigger (runs as postgres/service_role) can always insert — service_role bypasses RLS.
-- Authenticated users can read and update their own profile.
CREATE POLICY "own_read"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- Staff can read all profiles (e.g. for user management in POS)
CREATE POLICY "staff_read" ON public.profiles FOR SELECT TO authenticated USING (true);
