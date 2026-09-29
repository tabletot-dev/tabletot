// Pure helpers for the Menu screen. No imports, so `pnpm test` runs them under node.

export type Facts = Record<string, unknown>;

export interface FactsForm {
  prep: string;
  calories: string;
  allergens: string;
  spice: string;
  ingredients: string;
  notes: string;
}

export const csv = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? String(v) : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : '');

// Collapse whitespace and reuse an existing category's exact spelling, so
// "pastas " never becomes a second category next to "Pastas" (POS QA #7).
export function normalizeCategory(raw: string, existing: string[]): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return existing.find((c) => c.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

export function factsToForm(f: Facts | null): FactsForm {
  return {
    prep: num(f?.prep_minutes),
    calories: num(f?.calories_kcal),
    allergens: strs(f?.allergens),
    spice: text(f?.spice_level),
    ingredients: strs(f?.ingredients),
    notes: text(f?.notes),
  };
}

// Starts from the stored facts so keys this form doesn't know about survive a
// save; a blank field removes its key. An empty result is stored as null.
export function formToFacts(base: Facts | null, form: FactsForm): Facts | null {
  const out: Facts = { ...base };
  const set = (key: string, value: unknown) => {
    if (value === undefined) delete out[key];
    else out[key] = value;
  };
  const n = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0 ? Number(s) : undefined);
  set('prep_minutes', n(form.prep));
  set('calories_kcal', n(form.calories));
  set('allergens', csv(form.allergens).length ? csv(form.allergens) : undefined);
  set('spice_level', form.spice || undefined);
  set('ingredients', csv(form.ingredients).length ? csv(form.ingredients) : undefined);
  set('notes', form.notes.trim() || undefined);
  return Object.keys(out).length ? out : null;
}
