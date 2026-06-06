-- 0040_handle_new_user_trigger.sql
--
-- Fixes the signup RLS error introduced (implicitly) by 0022 by moving
-- profile + role bookkeeping off the client and onto a SECURITY DEFINER
-- trigger that runs on auth.users INSERT.
--
-- 0022 turned on RLS for `profiles` without an INSERT policy. The signup
-- code in apps/pos/src/contexts/AuthContext.tsx tried to do a client-side
-- INSERT immediately after supabase.auth.signUp(), which RLS blocked
-- ("new row violates row-level security policy for table profiles").
-- The original 0022 even has a comment hinting at the trigger that was
-- supposed to exist; this migration is that trigger.
--
-- The function reads the optional full_name supplied by the client via
-- supabase.auth.signUp({ options: { data: { full_name } } }) and seeds
-- a default 'staff' role. Existing auth.users rows (created before this
-- trigger) are not retroactively backfilled — handled inline below.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing auth.users that lack a profile/role row.
-- Safe under the ON CONFLICT guards above; idempotent on re-run.
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data ->> 'full_name', NULL)
FROM   auth.users u
LEFT   JOIN public.profiles p ON p.id = u.id
WHERE  p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'
FROM   auth.users u
LEFT   JOIN public.user_roles r ON r.user_id = u.id
WHERE  r.user_id IS NULL;
