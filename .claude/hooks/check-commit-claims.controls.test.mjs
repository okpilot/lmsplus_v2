// Planted RED/GREEN controls for the commit-claims guard's EXIT CODE — spawned, not imported.
// Split into its own file to avoid growing check-commit-claims.test.mjs past its file-size cap.
// code-style.md §7 "every guard suite carries a spawned, graded red and green control" applies
// here; check-commit-claims.test.mjs's own tests already drive these branches without the
// spawn + exit-code check the marker requires.
//
// Run: node --test .claude/hooks/check-commit-claims.controls.test.mjs

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertUsable, verdictOf } from './spawn.testkit.mjs'

const HOOK_PATH = fileURLToPath(new URL('./check-commit-claims.mjs', import.meta.url))
// Resolve the real repo root from the hook's own location, never process.cwd().
const rootOpts = { cwd: dirname(HOOK_PATH), encoding: 'utf8' }
const rootRun = spawnSync('git', ['rev-parse', '--show-toplevel'], rootOpts)
assertUsable('git rev-parse --show-toplevel', rootRun)
assert.equal(rootRun.status, 0, `git rev-parse --show-toplevel failed: ${rootRun.stderr}`)
const REPO_ROOT = rootRun.stdout.trim()

// CONTROL: red
// GROUP: check-commit-claims-always-passes
test('control: a message citing an absent SHA exits non-zero', () => {
  const absentSha = '0123456789abcdef'.repeat(3).slice(0, 40) // 40-char hex: never a real object
  const dir = mkdtempSync(join(tmpdir(), 'commit-claims-control-'))
  try {
    const msgFile = join(dir, 'MSG')
    writeFileSync(msgFile, `fixes bug per ${absentSha}\n`)
    let threw = false
    try {
      execFileSync(process.execPath, [HOOK_PATH, msgFile], { cwd: REPO_ROOT, encoding: 'utf8' })
    } catch (err) {
      threw = true
      assert.notEqual(verdictOf('control: absent SHA', err).status, 0)
    }
    assert.ok(threw, 'expected a non-zero exit for an unresolved SHA citation')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// CONTROL: green
// GROUP: check-commit-claims-always-blocks
test('control: a message citing HEAD exits 0', () => {
  // extractRefs requires a mixed digit+letter token; picking HEAD blindly can fail this test
  // against a CORRECT hook if the newest short SHA happens to be all-digit.
  const head = execFileSync('git', ['log', '-50', '--format=%h', '--abbrev=8'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.trim())
    .find((sha) => /^[0-9a-f]{7,40}$/.test(sha) && /[0-9]/.test(sha) && /[a-f]/.test(sha))
  assert.ok(head, 'no recent commit has a mixed digit+letter short SHA')
  const dir = mkdtempSync(join(tmpdir(), 'commit-claims-control-'))
  try {
    const msgFile = join(dir, 'MSG')
    writeFileSync(msgFile, `Fix applied in ${head} today.\n`)
    const r = spawnSync(process.execPath, [HOOK_PATH, msgFile], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    assertUsable('control: HEAD citation', r)
    assert.equal(r.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
