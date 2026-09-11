-- 0071_about_venue_config.sql
--
-- Venue/About screen (kiosk screen 16) content. Data-only: adds three keys to
-- restaurants.config for Silver. No schema change -- config is already jsonb
-- (migration 0012).
--
-- hours is from the venue's public listing (verified 2026-08-30). The kiosk
-- passes the street address as a literal string constant, so it is not stored
-- here. chef_name / chef_note are PLACEHOLDER copy -- replace with the venue's
-- own wording before this migration is pushed to remote.

UPDATE restaurants
SET config = config || jsonb_build_object(
  'hours',     '11 AM - 11 PM, every day',
  'chef_name', 'Rohit Nair',
  'chef_note', 'Our beans are roasted in small batches every week and pulled on a lever machine. The kitchen leans Mediterranean -- citrus, olive oil, fresh herbs. Ask us what is good today.'
)
WHERE id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';
