// Spawned, graded controls for the git-config bypasses of the two `git diff` calls that feed
// only the LLM PROMPT (the filtered large-diff call and the `--stat` fallback) — never the
// fallback grep scan. A repo-local `color.ui always` or `diff.noprefix true` (never committed,
// exactly what an attacker's own machine would carry) can otherwise corrupt what the LLM reads
// without any grep-based check noticing.
//
// Run: node --test .claude/hooks/run-security-auditor.prompt-config.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  commitInit,
  gitFactory,
  initShimScratch,
  runHookAndCleanup,
  TIMEOUT_MS,
} from './run-security-auditor.testkit.mjs'

// Validates the prompt piped to `claude` via stdin has no ANSI escape — approves only then.
const COLOR_VALIDATING_SHIM = `#!/usr/bin/env bash
stdin=$(cat)
if [[ "$stdin" == *$'\\e['* ]]; then
  printf 'BLOCKED: ANSI escape found in prompt\\n'
else
  printf 'APPROVED\\n'
fi
exit 0
`

// Validates the prompt piped to `claude` via stdin carries a `+++ b/` diff header — approves
// only then.
const PREFIX_VALIDATING_SHIM = `#!/usr/bin/env bash
stdin=$(cat)
if [[ "$stdin" == *'+++ b/'* ]]; then
  printf 'APPROVED\\n'
else
  printf 'BLOCKED: no +++ b/ prefix found in prompt\\n'
fi
exit 0
`

const BIG_CONTENT = `${Array.from({ length: 3001 }, (_, i) => `dummy line ${i + 1}`).join('\n')}\n`

/**
 * Scratch repo with a real `origin` upstream and a diff over MAX_DIFF_LINES, so the hook takes
 * the filtered-pathspec branch (line 55). `sensitive` controls whether a file matching the
 * filter pathspec also changes — with it, the filtered DIFF is non-empty and reaches the LLM
 * directly; without it, the filtered DIFF is empty and the hook falls through to `--stat`.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 * @param {boolean} sensitive  whether to also change a file the filter pathspec keeps
 */
function setupLargeUpstreamShimRepo(shimBody, sensitive) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-prompt-large-', shimBody)
  const remoteDir = join(scratch, 'remote.git')
  mkdirSync(remoteDir, { recursive: true })
  spawnSync('git', ['init', '-q', '--bare'], { cwd: remoteDir, timeout: TIMEOUT_MS })
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['remote', 'add', 'origin', remoteDir])
  const branch = git(['branch', '--show-current']).stdout.trim()
  git(['push', '-q', '-u', 'origin', branch])
  writeFileSync(join(repoDir, 'bigfile.txt'), BIG_CONTENT)
  if (sensitive) {
    mkdirSync(join(repoDir, 'supabase/migrations'), { recursive: true })
    writeFileSync(join(repoDir, 'supabase/migrations/001_init.sql'), 'select 1;\n')
  }
  git(['add', '-A'])
  git(['commit', '-qm', 'large diff'])
  const upstreamRef = git(['rev-parse', '--abbrev-ref', '@{upstream}']).stdout.trim()
  return { scratch, shimDir, repoDir, upstreamRef }
}

/**
 * Prove `color.ui always` is ACTIVE on the filtered-pathspec diff (line 55) before trusting a
 * test built on it: without `--no-color`, the migration file's hunk must carry an ANSI escape;
 * with it, none.
 */
function assertColorFilteredDiffActive(repoDir, upstreamRef) {
  const args = [`${upstreamRef}...HEAD`, '--', 'supabase/migrations/001_init.sql']
  const hidden = spawnSync('git', ['diff', ...args], { cwd: repoDir, encoding: 'utf8' })
  const shown = spawnSync('git', ['diff', '--no-color', ...args], {
    cwd: repoDir,
    encoding: 'utf8',
  })
  assert.ok(hidden.stdout.includes('\x1b['))
  assert.ok(!shown.stdout.includes('\x1b['))
}

/** Prove `diff.noprefix true` is ACTIVE on the filtered-pathspec diff (line 55). */
function assertNoprefixFilteredDiffActive(repoDir, upstreamRef) {
  const args = [`${upstreamRef}...HEAD`, '--', 'supabase/migrations/001_init.sql']
  const hidden = spawnSync('git', ['diff', ...args], { cwd: repoDir, encoding: 'utf8' })
  const shown = spawnSync('git', ['diff', '--src-prefix=a/', '--dst-prefix=b/', ...args], {
    cwd: repoDir,
    encoding: 'utf8',
  })
  assert.doesNotMatch(hidden.stdout, /^\+\+\+ b\//m)
  assert.match(shown.stdout, /^\+\+\+ b\//m)
}

// CONTROL: green
// GROUP: run-security-auditor-always-blocks, run-security-auditor-color-filtered-large-diff
// MUTATION: dropping --no-color from the large-diff filtered-pathspec call (line 55) lets a
// local `color.ui always` wrap the prompt sent to the LLM in ANSI escapes.
test('LLM receives no ANSI escapes from the filtered diff under color.ui=always (large diff path)', () => {
  const built = setupLargeUpstreamShimRepo(COLOR_VALIDATING_SHIM, true)
  const git = gitFactory(built.repoDir)
  git(['config', 'color.ui', 'always'])
  assertColorFilteredDiffActive(built.repoDir, built.upstreamRef)
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Push approved/)
})

// CONTROL: green
// GROUP: run-security-auditor-always-blocks, run-security-auditor-noprefix-filtered-large-diff
// MUTATION: dropping --src-prefix=a/ --dst-prefix=b/ from the large-diff filtered-pathspec call
// (line 55) lets a local `diff.noprefix true` strip the `b/` prefix from the diff sent to the LLM.
test('LLM receives a b/-prefixed diff under diff.noprefix=true (large diff path)', () => {
  const built = setupLargeUpstreamShimRepo(PREFIX_VALIDATING_SHIM, true)
  const git = gitFactory(built.repoDir)
  git(['config', 'diff.noprefix', 'true'])
  assertNoprefixFilteredDiffActive(built.repoDir, built.upstreamRef)
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Push approved/)
})

// CONTROL: green
// GROUP: run-security-auditor-always-blocks, run-security-auditor-color-stat-fallback
// MUTATION: dropping --no-color from the `--stat` fallback call (line 75) lets a local
// `color.ui always` wrap the stat summary sent to the LLM in ANSI escapes.
test('LLM receives no ANSI escapes from the --stat summary under color.ui=always (stat path)', () => {
  const built = setupLargeUpstreamShimRepo(COLOR_VALIDATING_SHIM, false)
  const git = gitFactory(built.repoDir)
  git(['config', 'color.ui', 'always'])
  const args = [`${built.upstreamRef}...HEAD`, '--stat']
  const hidden = spawnSync('git', ['diff', ...args], { cwd: built.repoDir, encoding: 'utf8' })
  const shown = spawnSync('git', ['diff', '--no-color', ...args], {
    cwd: built.repoDir,
    encoding: 'utf8',
  })
  assert.ok(hidden.stdout.includes('\x1b['))
  assert.ok(!shown.stdout.includes('\x1b['))
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Push approved/)
})
