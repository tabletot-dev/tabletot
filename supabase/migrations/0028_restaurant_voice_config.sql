-- 0028_restaurant_voice_config.sql
-- Migrates per-restaurant voice config from restaurants.json into the DB.
-- After this migration, load_restaurant_config() reads from DB only.
-- restaurants.json is deleted after the loader is confirmed working.
--
-- Changes:
--   1. Add slug + typed voice config columns to restaurants table.
--   2. Seed Silver SSC Hyd (UPDATE by pinned UUID).
--   3. Seed Sozo Cakery & Cafe Banjara Hills (INSERT with ON CONFLICT).

-- ============================================================
-- 1. Add columns
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS slug                   text,
  ADD COLUMN IF NOT EXISTS language_code          text,
  ADD COLUMN IF NOT EXISTS speaker                text,
  ADD COLUMN IF NOT EXISTS fallback_language_code text,
  ADD COLUMN IF NOT EXISTS fallback_speaker       text,
  ADD COLUMN IF NOT EXISTS voice_persona          text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_uidx
  ON restaurants (slug)
  WHERE slug IS NOT NULL;

-- ============================================================
-- 2. Seed Silver SSC Hyd voice config
-- ============================================================

UPDATE restaurants
SET
  slug                   = 'silver-ssc-hyd',
  language_code          = 'en-IN',
  speaker                = 'rohan',
  fallback_language_code = 'hi-IN',
  fallback_speaker       = 'ishita',
  voice_persona          = 'You are the customer-facing voice of Silver Specialty Coffee, a specialty coffee bar in Hyderabad. Knowledgeable about coffee, calm, and unhurried — like a barista who takes their craft seriously but stays approachable.'
WHERE id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';

-- ============================================================
-- 3. Seed Sozo Cakery & Cafe Banjara Hills
--    ON CONFLICT (name) to handle re-apply on local resets.
--    Sozo was already in restaurants.json; this replaces that entry.
-- ============================================================

INSERT INTO restaurants (
  name, pos_provider, slug,
  language_code, speaker,
  fallback_language_code, fallback_speaker,
  voice_persona
)
VALUES (
  'Sozo Cakery & Cafe Banjara Hills',
  'tabletot',
  'sozo-cakery-banjara',
  'en-IN',
  'rohan',
  'hi-IN',
  'ishita',
  'You are the customer-facing voice of Sozo Cakery & Cafe, a cozy bakery-cafe in Banjara Hills, Hyderabad. Cheerful, warm, and enthusiastic about the bakes and beverages on offer.'
)
ON CONFLICT (name) DO UPDATE
SET
  slug                   = EXCLUDED.slug,
  language_code          = EXCLUDED.language_code,
  speaker                = EXCLUDED.speaker,
  fallback_language_code = EXCLUDED.fallback_language_code,
  fallback_speaker       = EXCLUDED.fallback_speaker,
  voice_persona          = EXCLUDED.voice_persona;
