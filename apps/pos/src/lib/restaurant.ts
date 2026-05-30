// The restaurant this POS deployment manages. Mirrors the kiosk's
// VITE_RESTAURANT_ID so every row the POS writes is tenant-scoped.
//
// Why this exists: restaurant_tables.restaurant_id is nullable, and inserts
// that omit it land as NULL — which the kiosk's restaurant-scoped query then
// can't resolve (406 "Cannot coerce result to a single JSON object").
// Migration 0033 adds a column DEFAULT as a safety net, but the POS must set
// the value explicitly so the schema default never becomes load-bearing once a
// second tenant exists. See docs/notes/pos-restaurant-scoping.md.
export const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

if (!RESTAURANT_ID) {
  // Fail loud in dev — a missing ID silently reintroduces the NULL-scoping bug.
  console.error(
    'VITE_RESTAURANT_ID is not set. POS inserts will rely on the DB column ' +
      'default and break the moment a second restaurant is onboarded. ' +
      'Set it in apps/pos/.env.local (see .env.example).',
  );
}
