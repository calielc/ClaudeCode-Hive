import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abbreviatePath, countdown, relativeAge, shortModelName } from './format.ts'

test('model names are short', () => {
  assert.equal(shortModelName('claude-sonnet-5-5'), 'Sonnet 5.5')
  assert.equal(shortModelName('claude-opus-4-1-20250805'), 'Opus 4.1')
})

test('ages and countdowns', () => {
  const now = 1_000_000_000_000
  assert.equal(relativeAge(now - 30_000, now), 'now')
  assert.equal(relativeAge(now - 5 * 60_000, now), '5m')
  assert.equal(relativeAge(now - 3 * 3_600_000, now), '3h')
  assert.equal(relativeAge(now - 2 * 86_400_000, now), '2d')
  assert.equal(countdown(now + 90 * 60_000, now), '1h 30m')
  assert.equal(countdown(now + 50 * 3_600_000, now), '2d 2h')
})

test('paths show the home folder as a tilde', () => {
  assert.equal(abbreviatePath('/Users/me/code', '/Users/me'), '~/code')
})
