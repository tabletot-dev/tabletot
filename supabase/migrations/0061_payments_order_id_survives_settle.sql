-- 0061_payments_order_id_survives_settle.sql
--
-- payment_settled (0055's append_event) inserts a payments row and then
-- deletes the orders row in the same transaction. payments.order_id had
-- ON DELETE SET NULL, so it goes NULL immediately — every settled payment
-- today has order_id = NULL. get_aov_summary (Task 4) needs payments.order_id
-- to survive indefinitely to join payments back to a time-windowed span.
--
-- kot_tickets.order_id (0053) keeps its own ON DELETE SET NULL — Kitchen
-- Display only needs it while the order is active. payments diverges
-- because it needs to survive past order deletion; not an inconsistency,
-- a different requirement. Insert-time validity was never FK-dependent —
-- append_event only inserts a payment after `SELECT ... INTO v_order ...
-- IF FOUND` — so dropping the FK loses no correctness guarantee, only the
-- survive-past-delete behavior we're now removing on purpose. Matches
-- order_history.original_order_id's existing FK-less pattern.

ALTER TABLE payments DROP CONSTRAINT payments_order_id_fkey;
