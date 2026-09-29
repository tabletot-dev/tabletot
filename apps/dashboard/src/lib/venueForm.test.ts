import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configToForm, formToConfig, parseGst } from './venueForm.ts';

test('formToConfig keeps unknown keys and drops blank text fields', () => {
  const stored = { hours: '11-11', promos: [{ a: 1 }], wifi_ssid: 'OLD' };
  const form = { ...configToForm(stored), hours: '  ', wifi_ssid: ' CAFE ' };
  const out = formToConfig(stored, form);
  assert.deepEqual(out.promos, [{ a: 1 }]);
  assert.equal('hours' in out, false);
  assert.equal(out.wifi_ssid, 'CAFE');
});

test('configToForm defaults: voice on, name prompt off, password blank', () => {
  const f = configToForm({});
  assert.equal(f.voice_enabled, true);
  assert.equal(f.prompt_for_identity, false);
  assert.equal(f.wifi_password, '');
  assert.equal(configToForm({ voice_enabled: false }).voice_enabled, false);
});

test('a password keeps its spaces; switches are always written', () => {
  const out = formToConfig(null, { ...configToForm(null), wifi_password: ' a b ' });
  assert.equal(out.wifi_password, ' a b ');
  assert.equal(out.voice_enabled, true);
  assert.equal(out.prompt_for_identity, false);
});

test('parseGst accepts 0-100 only', () => {
  assert.equal(parseGst('5'), 5);
  assert.equal(parseGst('0'), 0);
  assert.equal(parseGst('18.5'), 18.5);
  assert.equal(parseGst(''), null);
  assert.equal(parseGst('abc'), null);
  assert.equal(parseGst('101'), null);
  assert.equal(parseGst('-1'), null);
});
