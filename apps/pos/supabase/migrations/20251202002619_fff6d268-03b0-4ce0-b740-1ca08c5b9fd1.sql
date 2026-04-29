-- Create areas table
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create tables table (restaurant tables)
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  table_number TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available', -- available, occupied, reserved, cleaning
  current_order_id UUID,
  assigned_captain UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(area_id, table_number)
);

-- Create item_variants table
CREATE TABLE public.item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE NOT NULL,
  variant_type TEXT NOT NULL, -- size, type, spice_level
  variant_name TEXT NOT NULL, -- Large, Small, Butter, Normal, Spicy, Less Spicy
  price_modifier NUMERIC DEFAULT 0, -- additional price for this variant
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create item_addons table
CREATE TABLE public.item_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE NOT NULL,
  addon_name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create kot_tickets table
CREATE TABLE public.kot_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  kot_number TEXT NOT NULL,
  table_number TEXT,
  items JSONB NOT NULL,
  special_notes TEXT,
  status TEXT DEFAULT 'pending', -- pending, preparing, ready
  printed_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create discount_types table
CREATE TABLE public.discount_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL, -- percentage, flat, coupon, automatic
  value NUMERIC NOT NULL,
  coupon_code TEXT UNIQUE,
  min_order_value NUMERIC DEFAULT 0,
  max_discount NUMERIC,
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  payment_method TEXT NOT NULL, -- cash, card, upi
  amount NUMERIC NOT NULL,
  tips NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'completed', -- pending, completed, failed
  transaction_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create staff table for captains/waiters
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL, -- captain, waiter, kitchen
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add triggers for updated_at
CREATE TRIGGER update_areas_updated_at
  BEFORE UPDATE ON public.areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_restaurant_tables_updated_at
  BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kot_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- RLS Policies for areas
CREATE POLICY "Staff can view areas" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage areas" ON public.areas FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- RLS Policies for restaurant_tables
CREATE POLICY "Staff can view tables" ON public.restaurant_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can update tables" ON public.restaurant_tables FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can manage tables" ON public.restaurant_tables FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- RLS Policies for item_variants
CREATE POLICY "Anyone can view variants" ON public.item_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage variants" ON public.item_variants FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- RLS Policies for item_addons
CREATE POLICY "Anyone can view addons" ON public.item_addons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage addons" ON public.item_addons FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- RLS Policies for kot_tickets
CREATE POLICY "Staff can view KOTs" ON public.kot_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create KOTs" ON public.kot_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update KOTs" ON public.kot_tickets FOR UPDATE TO authenticated USING (true);

-- RLS Policies for discount_types
CREATE POLICY "Staff can view discounts" ON public.discount_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage discounts" ON public.discount_types FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- RLS Policies for payments
CREATE POLICY "Staff can view payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for staff
CREATE POLICY "Staff can view staff" ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage staff" ON public.staff FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Create indexes for better performance
CREATE INDEX idx_restaurant_tables_area ON public.restaurant_tables(area_id);
CREATE INDEX idx_restaurant_tables_status ON public.restaurant_tables(status);
CREATE INDEX idx_item_variants_menu_item ON public.item_variants(menu_item_id);
CREATE INDEX idx_item_addons_menu_item ON public.item_addons(menu_item_id);
CREATE INDEX idx_kot_tickets_order ON public.kot_tickets(order_id);
CREATE INDEX idx_payments_order ON public.payments(order_id);