import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldReload } from './reloadOnDeploy.ts'

test('reloads for a different build when idle', () => {
  assert.equal(shouldReload('2', '1', true), true)
})
test('waits while busy', () => {
  assert.equal(shouldReload('2', '1', false), false)
})
test('ignores same build, failed check, dev', () => {
  assert.equal(shouldReload('1', '1', true), false)
  assert.equal(shouldReload(null, '1', true), false)
  assert.equal(shouldReload('2', 'dev', true), false)
})
