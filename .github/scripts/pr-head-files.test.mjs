// Unit tests for the pure functions in pr-head-files.mjs. No network I/O — main()'s fetch calls
// are exercised only by the workflow itself.
// Run: node --test .github/scripts/pr-head-files.test.mjs

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexLines, safePath, selectPatchless } from './pr-head-files.mjs'

// ---------------------------------------------------------------- selectPatchless

test('selectPatchless skips a removed file even with no patch', () => {
  const files = [{ filename: 'gone.ts', status: 'removed', patch: undefined }]
  assert.deepEqual(selectPatchless(files), [])
})

test('selectPatchless skips a file that carries a patch', () => {
  const files = [{ filename: 'a.ts', status: 'modified', patch: '@@ -1 +1 @@' }]
  assert.deepEqual(selectPatchless(files), [])
})

test('selectPatchless selects a modified file with no patch field', () => {
  const files = [{ filename: 'big.ts', status: 'modified' }]
  assert.deepEqual(selectPatchless(files), ['big.ts'])
})

test('selectPatchless selects a file whose patch is explicitly null', () => {
  const files = [{ filename: 'binary.png', status: 'added', patch: null }]
  assert.deepEqual(selectPatchless(files), ['binary.png'])
})

test('selectPatchless uses the new filename for a rename', () => {
  const files = [{ filename: 'new/path.ts', previous_filename: 'old/path.ts', status: 'renamed' }]
  assert.deepEqual(selectPatchless(files), ['new/path.ts'])
})

// ---------------------------------------------------------------- safePath

test('safePath rejects an absolute path', () => {
  assert.equal(safePath('/etc/passwd'), 'absolute path')
})

test('safePath rejects a .. path segment', () => {
  assert.equal(safePath('a/../../etc/passwd'), '.. path segment')
})

test('safePath rejects a .git/ path', () => {
  assert.equal(safePath('.git/config'), '.git/ path')
})

test('safePath accepts a normal nested path', () => {
  assert.equal(safePath('apps/web/app/app/quiz/page.tsx'), null)
})

// ---------------------------------------------------------------- indexLines

test('indexLines lists fetched and not-fetched paths with their reason', () => {
  const results = [
    { path: 'a.ts', fetched: true },
    { path: 'b.ts', fetched: false, reason: 'http 404' },
  ]
  assert.deepEqual(indexLines(results, false), ['fetched a.ts', 'not-fetched b.ts — http 404'])
})

test('indexLines appends a truncated line when the file list was capped', () => {
  assert.deepEqual(indexLines([{ path: 'a.ts', fetched: true }], true), [
    'fetched a.ts',
    'truncated',
  ])
})
