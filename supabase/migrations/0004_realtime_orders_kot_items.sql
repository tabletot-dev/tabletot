-- Extends supabase_realtime publication to orders and kot_items.
-- Stage 4 recommendation work and POS UI will subscribe to inserts on these
-- tables; enrolling now avoids silent-no-op debugging later.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table kot_items;
