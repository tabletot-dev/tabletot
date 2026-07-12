-- 0051_drop_recommendation_events.sql
-- Audit L7: recommendation_events has had no writer since the kiosk moved to the
-- event bus (0041 kiosk_events), and the ledger refactor (0047-0050) computes AOV
-- from table_events instead. No app or service code references it (only historical
-- CHANGELOG mentions). Drop the dead table.
DROP TABLE IF EXISTS recommendation_events;
