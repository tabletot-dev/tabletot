-- Lets the dashboard Menu screen upload dish photos (ADR 0025).
--
-- The menu-images bucket predates migrations (0026 only references its URLs),
-- so this creates it if missing and adds policies under new names: public
-- read for the kiosk, write for authorised staff only. Idempotent: safe on a
-- remote where the bucket already exists.

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "menu_images_public_read" ON storage.objects;
CREATE POLICY "menu_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "menu_images_staff_write" ON storage.objects;
CREATE POLICY "menu_images_staff_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'menu-images' AND is_authorized_staff(auth.uid()))
  WITH CHECK (bucket_id = 'menu-images' AND is_authorized_staff(auth.uid()));
