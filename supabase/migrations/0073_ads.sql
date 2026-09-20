-- 0073_ads.sql
-- Kiosk waiting-screen ad carousel: real image creative, admin-managed via
-- apps/dashboard, replacing the old restaurants.config.promos JSONB blob.

CREATE TABLE public.ads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  image_url     text NOT NULL,
  title         text,
  sort_order    int NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- anon (kiosk) only ever sees live ads, even on a stray unfiltered query.
CREATE POLICY "anon_read"   ON public.ads FOR SELECT USING (active = true);
CREATE POLICY "staff_write" ON public.ads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket for ad creative, uploaded from apps/dashboard.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads', 'ads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ads_bucket_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ads');

CREATE POLICY "ads_bucket_staff_write" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'ads') WITH CHECK (bucket_id = 'ads');
