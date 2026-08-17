-- 0065_grant_anon_authenticated_table_access.sql
-- 0022_rls_policies.sql created RLS policies but never granted the underlying
-- table-level privileges to anon/authenticated. Postgres checks GRANTs before
-- RLS is even evaluated, so anon/authenticated were blocked outright on a
-- fresh local DB (hosted Supabase projects set these up automatically at
-- project creation, but a local `db reset` does not).

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Keep future tables from hitting the same bug.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
