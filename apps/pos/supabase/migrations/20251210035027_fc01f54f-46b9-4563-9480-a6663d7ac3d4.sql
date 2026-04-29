-- Create order_history table to archive paid orders
CREATE TABLE public.order_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_order_id UUID NOT NULL,
  order_id TEXT NOT NULL,
  order_type TEXT NOT NULL,
  table_no TEXT,
  customer_name TEXT DEFAULT 'Walk-in Customer',
  items_json JSONB NOT NULL,
  subtotal NUMERIC NOT NULL,
  tax NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  special_instructions TEXT,
  source TEXT DEFAULT 'POS',
  payment_method TEXT NOT NULL,
  amount_paid NUMERIC NOT NULL,
  tips NUMERIC DEFAULT 0,
  created_by UUID,
  order_created_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Staff can view order history" 
ON public.order_history 
FOR SELECT 
USING (true);

CREATE POLICY "Staff can create order history" 
ON public.order_history 
FOR INSERT 
WITH CHECK (true);

-- Add index for common queries
CREATE INDEX idx_order_history_paid_at ON public.order_history(paid_at DESC);
CREATE INDEX idx_order_history_table_no ON public.order_history(table_no);