// Spawned, graded controls for the git-config bypasses of run-security-auditor.sh's fallback
// scan — a repo-local `color.ui always` or `diff.noprefix true` (never committed, exactly what
// an attacker's own machine would carry) defeats the `^\+`/`+++ b/` patterns the diagnostic
// scan greps for once the LLM audit itself has failed or timed out.
//
// Run: node --test .claude/hooks/run-security-auditor.config.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  commitInit,
  gitFactory,
  initShimScratch,
  runHookAndCleanup,
  TIMEOUT_SHIM,
} from './run-security-auditor.testkit.mjs'

/** An added line with a secret — routes the timeout branch's diagnostic scan to a finding. */
const SECRET_DIRTY_CONTENT = 'base\nsk_live_FAKE_TEST_KEY_1234567890\n'

/**
 * Build a repo with a repo-local `color.ui always` (uncommitted config, mirroring an attacker's
 * own machine) and an uncommitted secret change to `file.txt` — the no-upstream fallback diff.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function setupColorShimRepo(shimBody) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-color-', shimBody)
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['config', 'color.ui', 'always'])
  writeFileSync(join(repoDir, 'file.txt'), SECRET_DIRTY_CONTENT)
  return { scratch, shimDir, repoDir }
}

/**
 * Build a repo with a repo-local `diff.noprefix true` (uncommitted config) and a staged new
 * `.env` file — the no-upstream fallback diff the `.env`-commit check scans.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function setupNoprefixShimRepo(shimBody) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-noprefix-', shimBody)
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['config', 'diff.noprefix', 'true'])
  writeFileSync(join(repoDir, '.env'), 'SECRET=1\n')
  git(['add', '.env'])
  return { scratch, shimDir, repoDir }
}

/**
 * Prove `color.ui always` is ACTIVE before trusting a test built on it: without `--no-color`,
 * the added line must NOT match the fallback scan's `^\+` secret pattern (ANSI escapes precede
 * the `+`); with `--no-color`, it must match.
 *
 * @param {string} repoDir  the prepared repo's directory
 */
function assertColorConfigActive(repoDir) {
  const hidden = spawnSync('git', ['diff', 'HEAD'], { cwd: repoDir, encoding: 'utf8' })
  const shown = spawnSync('git', ['diff', '--no-color', 'HEAD'], { cwd: repoDir, encoding: 'utf8' })
  assert.doesNotMatch(hidden.stdout, /^\+.*sk_live_FAKE_TEST_KEY/m)
  assert.match(shown.stdout, /^\+.*sk_live_FAKE_TEST_KEY/m)
}

/**
 * Prove `diff.noprefix true` is ACTIVE before trusting a test built on it: without explicit
 * `--src-prefix=a/ --dst-prefix=b/`, the new-file header must read `+++ .env`, not `+++ b/.env`.
 *
 * @param {string} repoDir  the prepared repo's directory
 */
function assertNoprefixConfigActive(repoDir) {
  const hidden = spawnSync('git', ['diff', 'HEAD', '--', '.env'], {
    cwd: repoDir,
    encoding: 'utf8',
  })
  const shown = spawnSync(
    'git',
    ['diff', '--src-prefix=a/', '--dst-prefix=b/', 'HEAD', '--', '.env'],
    { cwd: repoDir, encoding: 'utf8' },
  )
  assert.doesNotMatch(hidden.stdout, /^\+\+\+ b\/\.env/m)
  assert.match(shown.stdout, /^\+\+\+ b\/\.env/m)
}

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-fallback-scan-timeout, run-security-auditor-color-fallback
// MUTATION: dropping --no-color from the no-upstream `git diff HEAD` fallback call lets a local
// `color.ui always` wrap every added line in ANSI escapes, so the fallback scan's `^\+` secret
// pattern never matches and the secret passes through unnoticed.
test('fallback scan still finds a secret color.ui=always hides on the no-upstream diff', () => {
  const built = setupColorShimRepo(TIMEOUT_SHIM)
  assertColorConfigActive(built.repoDir)
  const r = runHookAndCleanup(built)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-fallback-scan-timeout, run-security-auditor-noprefix-fallback
// MUTATION: dropping --src-prefix=a/ --dst-prefix=b/ from the no-upstream `git diff HEAD`
// fallback call lets a local `diff.noprefix true` strip the `b/` prefix from every header, so
// the fallback scan's `^\+\+\+ b/.*\.env` pattern never matches a committed `.env` file.
test('fallback scan still finds a .env file diff.noprefix=true hides on the no-upstream diff', () => {
  const built = setupNoprefixShimRepo(TIMEOUT_SHIM)
  assertNoprefixConfigActive(built.repoDir)
  const r = runHookAndCleanup(built)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})
