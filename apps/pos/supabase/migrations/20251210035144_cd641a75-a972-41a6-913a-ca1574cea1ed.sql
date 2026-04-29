-- Drop the restrictive policy and allow staff to delete any order they can view
DROP POLICY IF EXISTS "Staff can delete paid orders" ON public.orders;

CREATE POLICY "Staff can delete orders" 
ON public.orders 
FOR DELETE 
USING (true);