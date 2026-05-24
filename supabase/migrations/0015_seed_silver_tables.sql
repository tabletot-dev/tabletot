-- 0015_seed_silver_tables.sql
-- Seeds restaurant_tables rows for Silver Specialty Coffee (local pilot).
-- table_number has a UNIQUE constraint (not composite), so ON CONFLICT is safe.

INSERT INTO restaurant_tables (table_number, capacity, status, restaurant_id)
VALUES ('T1', 4, 'available', 'b22b5d53-6dd8-4f5b-8276-2e828cd1ab91')
ON CONFLICT (table_number) DO NOTHING;
