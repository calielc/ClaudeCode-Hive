import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { containsFolded, prepareNeedle } from './fold-search.ts'
import { searchDirectory, sessionIdFromPath } from './search-core.ts'

const has = (text: string, needle: string): boolean => containsFolded(Buffer.from(text), prepareNeedle(needle))

test('search ignores case for letters and finds text anywhere', () => {
  assert.ok(has('Where I did the DIFF2 tool', 'diff2'))
  assert.ok(has('Where I did the diff2 tool', 'DIFF2'))
  assert.ok(has('xxxxReview Threadxxxx', 'review thread'))
  assert.ok(has('a', 'A'))
})

test('search does not match a near miss', () => {
  assert.ok(!has('diff1 and dif f2', 'diff2'))
  assert.ok(!has('review  thread', 'review thread'))
  assert.ok(!has('', 'x'))
})

test('search finds a match at the very start and the very end', () => {
  assert.ok(has('needle in front', 'NEEDLE'))
  assert.ok(has('at the end needle', 'needle'))
})

test('search handles characters that are not letters', () => {
  assert.ok(has('call LX-2930 now', 'lx-2930'))
  assert.ok(has('path/to/file.ts', '/to/'))
  assert.ok(has('café au lait', 'café'))
})

test('a session id comes from a transcript path or a sub agent path', () => {
  assert.equal(sessionIdFromPath('abc.jsonl'), 'abc')
  assert.equal(sessionIdFromPath('abc/subagents/agent-1.jsonl'), 'abc')
  assert.equal(sessionIdFromPath('abc\\subagents\\agent-1.jsonl'), 'abc')
  assert.equal(sessionIdFromPath(''), undefined)
})

test('searching a folder finds sessions, also by what a sub agent did', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hive-search-'))
  writeFileSync(join(directory, 'one.jsonl'), '{"text":"nothing here"}\n')
  writeFileSync(join(directory, 'two.jsonl'), '{"text":"the Diff2 viewer"}\n')
  mkdirSync(join(directory, 'three', 'subagents'), { recursive: true })
  writeFileSync(join(directory, 'three.jsonl'), '{"text":"nothing"}\n')
  writeFileSync(join(directory, 'three', 'subagents', 'agent-1.jsonl'), '{"text":"built diff2 page"}\n')
  const ids = (await searchDirectory(directory, 'diff2')).sort()
  assert.deepEqual(ids, ['three', 'two'])
})
