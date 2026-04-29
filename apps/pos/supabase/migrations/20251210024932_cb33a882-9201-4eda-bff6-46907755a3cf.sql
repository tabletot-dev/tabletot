-- Add special_instructions and customer_name columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS special_instructions TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT 'Walk-in Customer';