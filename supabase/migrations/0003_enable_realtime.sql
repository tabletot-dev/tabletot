-- 0003_enable_realtime.sql
-- Enroll POS-native tables in supabase_realtime publication so
-- postgres_changes INSERT/UPDATE events fire for client subscriptions.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE kot_tickets;
