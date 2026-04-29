-- Allow deleting orders (for archiving after payment)
CREATE POLICY "Staff can delete paid orders" 
ON public.orders 
FOR DELETE 
USING (status = 'paid');