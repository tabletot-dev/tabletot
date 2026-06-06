-- 0038_session_display_name.sql
--
-- Optional customer first-name capture (Starbucks-cup pattern).
--
-- Adds display_name to sessions and kot_tickets so floor staff can address
-- customers by name when delivering, and the kiosk WaitingView can render a
-- personalized headline. Name is always optional and is nulled the moment a
-- session closes — see ADR 0016.
--
-- This is the kiosk-side scaffolding for the per-restaurant identity model;
-- mandatory phone collection for Petpooja-backed restaurants will extend the
-- same schema in a follow-up migration.

-- ============================================================
-- 1. Columns
-- ============================================================

ALTER TABLE sessions    ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE kot_tickets ADD COLUMN IF NOT EXISTS display_name text;

-- ============================================================
-- 2. Per-restaurant prompt flag
--
-- Silver runs the name-only flow. Restaurants without this flag set will
-- skip the IdentityView entirely and go straight from HomeView to menu.
-- ============================================================

UPDATE restaurants
SET config = config || '{"prompt_for_identity": true}'::jsonb
WHERE name = 'Silver Specialty Coffee';

-- ============================================================
-- 3. Null display_name on session close
--
-- Sibling trigger to free_table_on_session_close (0019); kept separate so
-- the name-clearing concern doesn't tangle with the table-state concern.
-- ============================================================

CREATE OR REPLACE FUNCTION clear_display_name_on_session_close()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    NEW.display_name := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clear_display_name_on_session_close ON sessions;

CREATE TRIGGER trg_clear_display_name_on_session_close
  BEFORE UPDATE OF status ON sessions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION clear_display_name_on_session_close();
