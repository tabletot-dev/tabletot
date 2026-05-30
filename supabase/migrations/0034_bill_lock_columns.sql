-- Fix D1: Add bill-lock columns to orders so the POS can snapshot the agreed
-- total before payment. bill_generated_at is the lock timestamp; once set the
-- kiosk should be blocked from adding more items (enforced in application code).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bill_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_discount     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_total        numeric;
