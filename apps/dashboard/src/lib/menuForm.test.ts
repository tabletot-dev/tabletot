import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategory, factsToForm, formToFacts } from './menuForm.ts';

test('normalizeCategory reuses existing spelling and collapses whitespace', () => {
  assert.equal(normalizeCategory('  pastas ', ['Coffee', 'Pastas']), 'Pastas');
  assert.equal(normalizeCategory('New   Bowls', ['Coffee']), 'New Bowls');
  assert.equal(normalizeCategory('   ', ['Coffee']), null);
});

test('formToFacts round-trips and keeps keys the form does not know', () => {
  const stored = { prep_minutes: 8, allergens: ['egg', 'dairy'], future_key: 'keep me' };
  const form = factsToForm(stored);
  assert.deepEqual(form.allergens, 'egg, dairy');
  assert.deepEqual(formToFacts(stored, form), stored);
});

test('formToFacts drops blank and invalid fields, null when nothing is left', () => {
  const form = { ...factsToForm(null), prep: 'abc', calories: '-5', allergens: ' , ' };
  assert.equal(formToFacts(null, form), null);
  const edited = formToFacts({ prep_minutes: 8 }, { ...factsToForm({ prep_minutes: 8 }), prep: '' });
  assert.equal(edited, null);
});
