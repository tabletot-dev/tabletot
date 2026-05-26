-- 0024_restaurant_tables_realtime.sql
--
-- restaurant_tables was missing from the realtime publication.
-- DB triggers in 0019 update it when sessions open/close, but the POS
-- Tables screen never received those changes because the table wasn't enrolled.
--
-- Also set REPLICA IDENTITY FULL on orders and restaurant_tables so that
-- UPDATE events include the full row — required for correct RLS evaluation
-- in Supabase Realtime when the updating role differs from the subscriber role.

ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;

ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE public.orders            REPLICA IDENTITY FULL;
