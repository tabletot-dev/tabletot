-- 0070_drop_kiosk_events.sql
--
-- Fix (2026-08-28 pre-deployment audit, finding 9). kiosk_events (0041,
-- ADR 0017's single client-side event bus) has no writer and no reader
-- anywhere in the codebase — confirmed by grep across apps/, services/,
-- and supabase/ finding only its own migration and the generated
-- types.ts files. ADR 0019 (the table_events ledger) superseded 0017
-- before kiosk_events ever got a real caller wired up: eventBus.ts's
-- track() writes to table_events via append_event, not this table (see
-- ADR 0017's frontmatter, marked superseded in this same commit).
--
-- Same precedent as 0051 dropping recommendation_events for the same
-- reason (a dead table from a superseded design). Regenerating
-- apps/*/src/integrations/supabase/types.ts is the documented follow-up
-- (docs/notes/regenerate-types-after-migrations.md) — no live Supabase
-- project was available in this session to run `supabase gen types`, but
-- the stale type entry is inert: nothing in any app queries kiosk_events,
-- so there's no tsc or runtime impact until that regen happens.

DROP TABLE IF EXISTS kiosk_events;
