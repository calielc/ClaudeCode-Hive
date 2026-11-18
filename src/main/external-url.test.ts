import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAppUrl, isOpenable } from './external-url.ts'

test('web and mail links open outside the app', () => {
  assert.ok(isOpenable('https://claude.ai/oauth/authorize?code=true&client_id=abc'))
  assert.ok(isOpenable('http://localhost:3000/callback'))
  assert.ok(isOpenable('mailto:someone@example.com'))
})

test('other kinds of link are refused', () => {
  assert.ok(!isOpenable('file:///etc/passwd'))
  assert.ok(!isOpenable('javascript:alert(1)'))
  assert.ok(!isOpenable('vscode://open?file=x'))
  assert.ok(!isOpenable('not a url'))
  assert.ok(!isOpenable(''))
})

test('the pages of the app are not treated as outside links', () => {
  assert.ok(isAppUrl('file:///Applications/Hive.app/Contents/Resources/app.asar/out/renderer/index.html#/terminal/x', undefined))
  assert.ok(isAppUrl('http://localhost:5173/#/terminal/x', 'http://localhost:5173'))
  assert.ok(!isAppUrl('https://claude.ai/login', 'http://localhost:5173'))
  assert.ok(!isAppUrl('http://localhost:3000/', 'http://localhost:5173'))
})
