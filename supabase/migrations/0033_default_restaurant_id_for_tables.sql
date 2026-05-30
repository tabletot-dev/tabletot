-- 0033_default_restaurant_id_for_tables.sql
-- Fix: Unblock POS table creation by defaulting restaurant_id to Silver's UUID,
-- and backfill any NULL values so they are resolvable by the kiosk.

ALTER TABLE public.restaurant_tables 
  ALTER COLUMN restaurant_id SET DEFAULT 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';

UPDATE public.restaurant_tables 
  SET restaurant_id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91' 
  WHERE restaurant_id IS NULL;
