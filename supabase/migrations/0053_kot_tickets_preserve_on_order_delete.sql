-- 0053_kot_tickets_preserve_on_order_delete.sql
--
-- Discovered while smoke-testing 0052's KOT archive: kot_tickets.order_id had
-- ON DELETE CASCADE (set in 0001). payment_settled and service_ended DELETE
-- FROM orders after archiving the order to order_history — but that DELETE
-- cascades and hard-deletes every kot_tickets row for that order, including
-- the one 0052 just marked 'archived' moments earlier in the same
-- transaction. So the archive step was a no-op either way (client-side,
-- pre-0052, or server-side in 0052): the row never survives to be read as
-- "archived", it's just gone. Kitchen ticket history was being destroyed on
-- every settle. `payments.order_id` already uses ON DELETE SET NULL for the
-- same reason (0001) — kot_tickets should match.

ALTER TABLE kot_tickets DROP CONSTRAINT kot_tickets_order_id_fkey;
ALTER TABLE kot_tickets
  ADD CONSTRAINT kot_tickets_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
