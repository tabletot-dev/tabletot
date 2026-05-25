-- 0020_voice_turns.sql
--
-- Records each voice ordering turn for analytics and recommendation debugging.
-- No raw transcripts stored — resolved items only (DPDP compliance for pilot).
-- Soft link to sessions via session_key (no hard FK — voice engine may not always
-- have a kiosk session in scope).

CREATE TABLE IF NOT EXISTS voice_turns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key       text,                       -- matches sessions.session_key when available
  restaurant_id     text,                       -- restaurant slug (e.g. 'silver-ssc-hyd')
  table_number      text,
  resolved_items    jsonb,                      -- [{raw, item, quantity, action}] where applied_to_order=true
  unresolved_phrases text[],                    -- raw_name values where resolver returned NoMatch
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_turns_session_key    ON voice_turns (session_key);
CREATE INDEX IF NOT EXISTS idx_voice_turns_restaurant_id  ON voice_turns (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_voice_turns_created_at     ON voice_turns (created_at DESC);
