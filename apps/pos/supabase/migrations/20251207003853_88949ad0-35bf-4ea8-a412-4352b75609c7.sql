-- Drop the existing check constraint and add a new one with more status values
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status = ANY (ARRAY['new', 'draft', 'preparing', 'ready', 'served', 'completed', 'paid', 'cancelled']));