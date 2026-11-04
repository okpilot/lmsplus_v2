// #1202: the guard's success line reports inspected AND excluded counts in both modes.
// Run: node --test .claude/hooks/check-soft-delete-guard.summary.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertUsable } from './spawn.testkit.mjs'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'check-soft-delete-guard.mjs')
const TIMEOUT_MS = 10_000
const CLEAN_SRC = 'export const x = 1\n'

function runGuard(cwd, args) {
  const r = spawnSync('node', [HOOK, ...args], { cwd, encoding: 'utf8', timeout: TIMEOUT_MS })
  assertUsable('check-soft-delete-guard.mjs', r, TIMEOUT_MS)
  return r
}

function withTree(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'soft-delete-summary-'))
  try {
    for (const rel of files) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true })
      writeFileSync(join(dir, rel), CLEAN_SRC)
    }
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// GROUP: check-soft-delete-guard-always-blocks, check-soft-delete-guard-excluded-uncounted
test('staged mode reports one excluded path for a /scripts/ .ts file', () => {
  withTree(['apps/web/scripts/tool.ts'], (dir) => {
    const r = runGuard(dir, [join(dir, 'apps/web/scripts/tool.ts')])
    assert.equal(r.status, 0)
    assert.match(r.stdout, /0 file\(s\) inspected, 1 excluded, 0 violations/)
  })
})

// GROUP: check-soft-delete-guard-always-blocks
test('staged mode does not count a missing staged path as excluded', () => {
  withTree([], (dir) => {
    const r = runGuard(dir, [join(dir, 'apps/web/gone.ts')])
    assert.equal(r.status, 0)
    assert.match(r.stdout, /0 file\(s\) inspected, 0 excluded, 0 violations/)
  })
})

// GROUP: check-soft-delete-guard-always-blocks, check-soft-delete-guard-excluded-uncounted
test('full mode reports inspected and excluded counts from the walk', () => {
  withTree(['apps/web/lib/a.ts', 'apps/web/scripts/b.ts'], (dir) => {
    const r = runGuard(dir, [])
    assert.equal(r.status, 0)
    assert.match(r.stdout, /1 file\(s\) inspected, 1 excluded, 0 violations/)
  })
})
