-- 0046_voice_sessions_table.sql
--
-- Persistent audit log of voice sessions so Railway restarts don't leave
-- ghost 'active' rows in the system. The backend writes a row on every
-- create_session() call and updates status on end / reap / shutdown.
--
-- status vocabulary:
--   active      — session live in memory right now
--   closed      — ended normally (client called /voice/session/end)
--   reaped      — idle for > SESSION_IDLE_SECONDS, swept by background reaper
--   interrupted — process crashed / restarted before session could be closed
--
-- This table is written only by the order-engine backend via DATABASE_URL
-- (postgres/service-role conn — RLS is bypassed). No anon/authenticated
-- access is granted.

CREATE TABLE IF NOT EXISTS voice_sessions (
  session_id         text        PRIMARY KEY,
  restaurant_id      text        NOT NULL,
  table_id           text        NOT NULL,
  client_session_key text,
  status             text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'closed', 'reaped', 'interrupted')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_active_at     timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz
);

CREATE INDEX IF NOT EXISTS voice_sessions_status_idx ON voice_sessions (status)
  WHERE status = 'active';
