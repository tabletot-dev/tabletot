-- 0039_drop_display_name_null_trigger.sql
--
-- Reverses the null-on-close behavior introduced in 0038.
--
-- The trigger nulled sessions.display_name the moment a session closed,
-- which made the new IdentityView feature look broken: by the time the
-- dashboard or owner queried the data, every closed session showed NULL
-- even though the customer had typed a name. The original intent was
-- privacy — "don't leak one customer's name to the next visit" — but
-- that's already handled client-side: clearSession() in the kiosk drops
-- sessionStorage.tt_display_name, so the next kiosk session starts blank.
-- The DB trigger was destroying valuable data for no real privacy gain.
--
-- After this migration the name persists on the sessions row forever
-- (until the row is manually deleted). The IdentityView disclaimer was
-- updated in lockstep to drop the misleading "won't store after you
-- leave" claim — see commit history.

DROP TRIGGER IF EXISTS trg_clear_display_name_on_session_close ON sessions;
DROP FUNCTION IF EXISTS clear_display_name_on_session_close();
