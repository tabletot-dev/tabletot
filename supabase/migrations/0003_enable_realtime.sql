-- 0003_enable_realtime.sql
-- Enrolls `kots` in supabase_realtime publication so postgres_changes
-- INSERT events fire for client subscriptions. Without this, the publication
-- is empty by default and Realtime listeners silently no-op.
ALTER PUBLICATION supabase_realtime ADD TABLE kots;
