-- 0064_restaurant_elevenlabs_voice_config.sql
-- Adds ElevenLabs voice config columns alongside the existing Sarvam
-- speaker/fallback_speaker columns (migration 0028). Additive only —
-- Sarvam's columns and seeded values are untouched.
--
-- Voice IDs seeded here are deliberate placeholders (Adam / Rachel from
-- ElevenLabs' documented default voice library), meant to be swapped after
-- a real listening test — see
-- docs/plans/2026-08-15-elevenlabs-voice-integration.md, decision 5.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id          text,
  ADD COLUMN IF NOT EXISTS elevenlabs_fallback_voice_id text;

UPDATE restaurants
SET elevenlabs_voice_id          = 'pNInz6obpgDQGcFmaJgB',  -- Adam (placeholder)
    elevenlabs_fallback_voice_id = '21m00Tcm4TlvDq8ikWAM'   -- Rachel (placeholder)
WHERE id = 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91';           -- Silver SSC Hyd
