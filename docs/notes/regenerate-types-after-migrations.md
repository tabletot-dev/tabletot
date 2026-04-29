# Sharp edge: regenerate types.ts after every migration

After any change to `supabase/migrations/`, both apps' generated types are stale until regenerated:

```bash
supabase gen types typescript --local > apps/pos/src/integrations/supabase/types.ts
supabase gen types typescript --local > apps/kiosk/src/integrations/supabase/types.ts
```

## Why this bites silently

`tsc --noEmit` only fails if the stale type is *referenced* in a way that conflicts. Migrations that add columns, relax NOT NULLs, or add tables produce no TS errors until something tries to use the new shape — which can be many commits later, in unrelated work. The regression looks like "weirdly broken in a feature that didn't touch types," not "stale types from migration N."

## Discipline for now

After writing a migration and running `supabase db reset`, regenerate both before committing.

## When to script it

Trigger to write `scripts/sync-types.sh`: either (a) we hit five-plus migrations and forgetting becomes likely, or (b) it costs me debugging time once. Until then, manual is cheaper than the script.

## Related

ADR-0002 (Supabase as the canonical store).
Migrations 0002, 0003 both required type regeneration; 0001 was the initial generation.
