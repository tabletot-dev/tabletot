import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formToRule, ruleToForm, ruleError, emptyRuleForm } from './ruleForm.ts';

const form = { ...emptyRuleForm(), rule_name: 'Coffee needs a bite', kind: 'missing_category' as const, category: 'Breakfast', item_id: 'i1', text: 'Add a toast?', priority: '5' };

test('form -> row -> form round-trips, in the shape the kiosk reads', () => {
  const row = formToRule(form);
  assert.deepEqual(row.condition, { missing_category: 'Breakfast' });
  assert.deepEqual(row.suggestion, { text: 'Add a toast?', item_id: 'i1' });
  assert.deepEqual(ruleToForm(row), form);
});

test('shapes the form cannot express come back null (never rewritten)', () => {
  const ok = formToRule(form);
  assert.equal(ruleToForm({ ...ok, condition: { has_category: 'A', min_total: 300 } }), null);
  assert.equal(ruleToForm({ ...ok, condition: { min_total: 300 } }), null);
  assert.equal(ruleToForm({ ...ok, suggestion: { text: 'x', item_id: 'i1', extra: 1 } }), null);
  assert.equal(ruleToForm({ ...ok, suggestion: { text: 'x' } }), null);
  assert.equal(ruleToForm({ ...ok, condition: null }), null);
});

test('ruleError names the first problem', () => {
  assert.equal(ruleError(form), null);
  assert.equal(ruleError({ ...form, rule_name: ' ' }), 'Give the rule a name');
  assert.equal(ruleError({ ...form, category: '' }), 'Pick a category');
  assert.equal(ruleError({ ...form, item_id: '' }), 'Pick the item to suggest');
  assert.equal(ruleError({ ...form, text: '' }), 'Write the nudge text');
  assert.equal(ruleError({ ...form, priority: '1.5' }), 'Priority must be a whole number');
  assert.equal(ruleError({ ...form, priority: '' }), 'Priority must be a whole number');
});
