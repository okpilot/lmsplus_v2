// Spawned, graded controls for run-security-auditor.sh (Decision 79, code-style.md §7).
//
// The auditor's only suite is bash (run-security-auditor.test.sh) — run-mutations.mjs only
// reads `//` CONTROL/GROUP markers and only runs `node --test` suites, so the guard was
// registered EXEMPT ("bash suite; parser reads // markers only"). This file gives it a
// spawned red and green control the harness CAN grade, without touching the shell script or
// its existing bash test suite.
//
// Builds a throwaway git repo and PATH-shims `claude` exactly the way
// run-security-auditor.test.sh's run_cli_failure_case / run_cli_success_case do, then spawns
// the real hook the way lefthook runs it at pre-push: `bash .claude/hooks/run-security-auditor.sh`
// with no arguments, cwd inside the repo. Never touches the network or the real `claude` CLI.
//
// Run: node --test .claude/hooks/run-security-auditor.controls.test.mjs

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  commitInit,
  gitFactory,
  initShimScratch,
  KILL_AFTER_TIMEOUT_SHIM,
  runHookAndCleanup,
  TIMEOUT_MS,
  TIMEOUT_SHIM,
} from './run-security-auditor.testkit.mjs'

/** The default committed change — no secret, no `.env`, no `SELECT *`, no `adminClient`. */
const DEFAULT_COMMITTED_CONTENT = 'base\nchanged\n'

/**
 * Build a repo with a real `origin` upstream so `@{upstream}` resolves, then a COMMITTED change on
 * top — the hook's `"$REMOTE_REF"...HEAD` diff is a commit-to-commit comparison, not a
 * working-tree one, so content must land in a real commit to be visible on it at all. Without an
 * upstream the hook blocks before the LLM call, so every fixture here has one.
 *
 * @param {string} prefix       `mkdtempSync` prefix
 * @param {string} shimBody     a full shebang script written to the shim's `claude` executable
 * @param {Record<string, string>} files  path -> content committed on top of the pushed base
 * @param {boolean} [textconv]  also hide `secret.txt` behind a local, never-committed
 *                              `diff.hide.textconv` driver, mirroring an attacker's own machine
 */
function buildUpstreamRepo(prefix, shimBody, files, textconv = false) {
  const { scratch, shimDir, repoDir } = initShimScratch(prefix, shimBody)
  const remoteDir = join(scratch, 'remote.git')
  mkdirSync(remoteDir, { recursive: true })
  if (textconv) writeFileSync(join(repoDir, '.gitattributes'), 'secret.txt diff=hide\n')
  spawnSync('git', ['init', '-q', '--bare'], { cwd: remoteDir, timeout: TIMEOUT_MS })
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['remote', 'add', 'origin', remoteDir])
  const branch = git(['branch', '--show-current']).stdout.trim()
  git(['push', '-q', '-u', 'origin', branch])
  if (textconv) git(['config', 'diff.hide.textconv', 'sh -c true'])
  for (const [name, content] of Object.entries(files)) writeFileSync(join(repoDir, name), content)
  git(['add', '-A'])
  git(['commit', '-qm', 'leak'])
  const upstreamRef = git(['rev-parse', '--abbrev-ref', '@{upstream}']).stdout.trim()
  return { scratch, shimDir, repoDir, upstreamRef }
}

/**
 * An upstream repo whose committed change to `file.txt` holds `committedContent`.
 *
 * @param {string} shimBody      a full shebang script written to the shim's `claude` executable
 * @param {string} committedContent  `file.txt`'s committed content — what the hook's diff carries
 */
function setupShimRepo(shimBody, committedContent) {
  return buildUpstreamRepo('sec-aud-controls-', shimBody, { 'file.txt': committedContent })
}

/**
 * Spawn the real hook inside a fresh upstream repo, with no arguments.
 *
 * @param {string} shimBody      a full shebang script written to the shim's `claude` executable
 * @param {string} [committedContent]  `file.txt`'s committed content — defaults to no secret/`.env`
 */
function runHookWithShim(shimBody, committedContent = DEFAULT_COMMITTED_CONTENT) {
  return runHookAndCleanup(setupShimRepo(shimBody, committedContent))
}

/**
 * Build an upstream repo where a COMMITTED `secret.txt` is hidden from the `"$REMOTE_REF"...HEAD`
 * diff by a local `diff.hide.textconv` driver. `file.txt` also changes so the overall diff isn't
 * emptied outright.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function setupUpstreamShimRepo(shimBody) {
  return buildUpstreamRepo(
    'sec-aud-upstream-',
    shimBody,
    { 'file.txt': 'base\nchanged\n', 'secret.txt': 'sk_live_FAKE_TEST_KEY_1234567890\n' },
    true,
  )
}

/**
 * Prove the textconv driver is ACTIVE before trusting a test built on it: without
 * `--no-textconv`, the diff must lack the secret; with it, the diff must contain it.
 *
 * @param {string} repoDir              the prepared repo's directory
 * @param {string[]} diffArgs           ref args appended to `git diff` (e.g. `['HEAD']`)
 */
function assertTextconvDriverActive(repoDir, diffArgs) {
  const hidden = spawnSync('git', ['diff', ...diffArgs], { cwd: repoDir, encoding: 'utf8' })
  const shown = spawnSync('git', ['diff', '--no-textconv', ...diffArgs], {
    cwd: repoDir,
    encoding: 'utf8',
  })
  assert.doesNotMatch(hidden.stdout, /sk_live_FAKE_TEST_KEY/)
  assert.match(shown.stdout, /sk_live_FAKE_TEST_KEY/)
}

const BLOCKED_SHIM = `#!/usr/bin/env bash
cat <<'EOF'
## Security Audit Findings

[HIGH] simulated finding for the red control
--- VERDICT ---
BLOCKED: simulated finding.
EOF
exit 0
`

const APPROVED_SHIM = `#!/usr/bin/env bash
cat <<'EOF'
## Security Audit Findings

No CRITICAL or HIGH issues found.

--- VERDICT ---
APPROVED
EOF
exit 0
`

// Any non-zero exit except 124 and 137 takes the CLI-failure branch, not the timeout branch.
const CLI_FAILURE_SHIM = `#!/usr/bin/env bash
echo "simulated claude CLI failure" >&2
exit 1
`

/** A `timeout` stand-in: reports a timeout (124) only when called with `-k`, else exits 3. */
const KILL_AFTER_CHECKING_TIMEOUT = `#!/usr/bin/env bash
if [ "$1" = "-k" ]; then exit 124; fi
exit 3
`

// An added line matching the fallback scan's secret pattern
// (`eyJ|sk_live_|service_role|-----BEGIN`) — routes the diagnostic scan to "Found N issue(s)"
// instead of falling through to fail_closed_no_llm_output.
const SECRET_COMMITTED_CONTENT = 'base\nsk_live_FAKE_TEST_KEY_1234567890\n'

// A validating shim: reads the prompt piped to it via stdin (the security-auditor.md prefix
// + the DIFF being pushed) and only returns APPROVED when the diff section contains the
// secret token — used to prove the LLM receives the unmasked diff content.
const DIFF_VALIDATING_SHIM = `#!/usr/bin/env bash
stdin=$(cat)
if printf '%s' "$stdin" | grep -q 'sk_live_FAKE_TEST_KEY'; then
  printf 'APPROVED\\n'
  exit 0
else
  printf 'BLOCKED: secret not found in diff sent to LLM\\n'
  exit 0
fi
`

// CONTROL: red
// GROUP: run-security-auditor-always-passes
test('blocks the push when the security audit returns a BLOCKED verdict', () => {
  const r = runHookWithShim(BLOCKED_SHIM)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Push blocked/)
})

// CONTROL: green
// GROUP: run-security-auditor-always-blocks
test('approves the push when the security audit returns a clean APPROVED verdict', () => {
  const r = runHookWithShim(APPROVED_SHIM)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Push approved/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-fail-closed-no-llm-output
// MUTATION: forcing fail_closed_no_llm_output's `exit 1` to `exit 0` turns a CLI failure with
// nothing for the diagnostic scan to find into an approved push.
test('fails closed when the CLI fails and the diagnostic scan finds nothing', () => {
  const r = runHookWithShim(CLI_FAILURE_SHIM)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Fix the Claude CLI/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-fallback-scan-timeout
// MUTATION: forcing the timeout branch's "Found N issue(s)" `exit 1` to `exit 0` turns a
// timed-out CLI run with a secret in the diff into an approved push.
test('blocks the push via the fallback scan when the CLI times out and a secret is in the diff', () => {
  const r = runHookWithShim(TIMEOUT_SHIM, SECRET_COMMITTED_CONTENT)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-fallback-scan-timeout, run-security-auditor-kill-after-timeout
// MUTATION: dropping the exit-137 test from the timeout branch routes a CLI that `timeout -k` had
// to SIGKILL into the CLI-failure branch, which never prints "Timed out".
test('reports a timeout when the CLI is killed after the grace period', () => {
  const r = runHookWithShim(KILL_AFTER_TIMEOUT_SHIM, SECRET_COMMITTED_CONTENT)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Timed out after/)
})

// GROUP: run-security-auditor-always-passes, run-security-auditor-fail-closed-no-llm-output, run-security-auditor-no-kill-after
// MUTATION: dropping `-k 10` from the `timeout` call reaches this `timeout` shim without `-k`, so it
// exits 3 instead of 124 and the hook never prints "Timed out".
test('passes a kill-after grace period to timeout', () => {
  const built = setupShimRepo(APPROVED_SHIM, DEFAULT_COMMITTED_CONTENT)
  writeFileSync(join(built.shimDir, 'timeout'), KILL_AFTER_CHECKING_TIMEOUT)
  chmodSync(join(built.shimDir, 'timeout'), 0o755)
  const r = runHookAndCleanup(built)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Timed out after/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-fallback-scan-cli-failure
// MUTATION: forcing the CLI-failure branch's "Found N issue(s)" `exit 1` to `exit 0` turns a
// failed CLI run with a secret in the diff into an approved push.
test('blocks the push via the fallback scan when the CLI fails and a secret is in the diff', () => {
  const r = runHookWithShim(CLI_FAILURE_SHIM, SECRET_COMMITTED_CONTENT)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-textconv-upstream
// MUTATION: dropping --no-textconv from the "$REMOTE_REF"...HEAD diff call lets a local
// textconv driver empty a leaking file's diff, hiding its secret from the fallback scan.
test('fallback scan still finds a secret a textconv driver hides on the upstream diff', () => {
  const built = setupUpstreamShimRepo(TIMEOUT_SHIM)
  assertTextconvDriverActive(built.repoDir, [`${built.upstreamRef}...HEAD`])
  const r = runHookAndCleanup(built)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-extdiff-upstream
// MUTATION: dropping --no-ext-diff from the "$REMOTE_REF"...HEAD diff call lets GIT_EXTERNAL_DIFF
// hide every added line from the fallback scan.
test('fallback scan still finds a secret GIT_EXTERNAL_DIFF hides on the upstream diff', () => {
  const built = setupShimRepo(TIMEOUT_SHIM, SECRET_COMMITTED_CONTENT)
  const extEnv = { ...process.env, GIT_EXTERNAL_DIFF: 'true' }
  const range = `${built.upstreamRef}...HEAD`
  const hidden = spawnSync('git', ['diff', range], {
    cwd: built.repoDir,
    encoding: 'utf8',
    env: extEnv,
  })
  const shown = spawnSync('git', ['diff', '--no-ext-diff', range], {
    cwd: built.repoDir,
    encoding: 'utf8',
    env: extEnv,
  })
  assert.doesNotMatch(hidden.stdout, /sk_live_FAKE_TEST_KEY/)
  assert.match(shown.stdout, /sk_live_FAKE_TEST_KEY/)
  const r = runHookAndCleanup(built, { GIT_EXTERNAL_DIFF: 'true' })
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})

// ── Large-diff path: filtered call (>3000 lines triggers the security-sensitive-only pathspec) ──

/**
 * Scratch repo with an upstream, a diff over MAX_DIFF_LINES, and a secret in a migration file
 * the hook's large-diff pathspec keeps. A `diff.hide.textconv` driver hides that file's content.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function setupLargeTextconvUpstreamShimRepo(shimBody) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-large-tc-', shimBody)
  const remoteDir = join(scratch, 'remote.git')
  mkdirSync(remoteDir, { recursive: true })
  // .gitattributes must be committed before the diff that includes the SQL file
  writeFileSync(join(repoDir, '.gitattributes'), '*.sql diff=hide\n')
  spawnSync('git', ['init', '-q', '--bare'], { cwd: remoteDir, timeout: TIMEOUT_MS })
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['remote', 'add', 'origin', remoteDir])
  const branch = git(['branch', '--show-current']).stdout.trim()
  git(['push', '-q', '-u', 'origin', branch])
  // Local textconv driver — never committed (mirrors the attacker's own machine config)
  git(['config', 'diff.hide.textconv', 'sh -c true'])
  // Large file: >3000 lines triggers the hook's large-diff filtered-pathspec branch
  const bigContent = `${Array.from({ length: 3001 }, (_, i) => `dummy line ${i + 1}`).join('\n')}\n`
  writeFileSync(join(repoDir, 'bigfile.txt'), bigContent)
  // Secret in a security-sensitive file matching `**/migrations/**` and `**/*.sql` pathspecs
  mkdirSync(join(repoDir, 'supabase/migrations'), { recursive: true })
  writeFileSync(
    join(repoDir, 'supabase/migrations/001_init.sql'),
    'sk_live_FAKE_TEST_KEY_1234567890\n',
  )
  git(['add', '-A'])
  git(['commit', '-qm', 'large diff with secret'])
  const upstreamRef = git(['rev-parse', '--abbrev-ref', '@{upstream}']).stdout.trim()
  return { scratch, shimDir, repoDir, upstreamRef }
}

/**
 * Build the same large-diff upstream repo without a textconv driver. Used by the ext-diff
 * fixture, where GIT_EXTERNAL_DIFF is the only driver hiding content.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function setupLargeExtDiffUpstreamShimRepo(shimBody) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-large-ed-', shimBody)
  const remoteDir = join(scratch, 'remote.git')
  mkdirSync(remoteDir, { recursive: true })
  spawnSync('git', ['init', '-q', '--bare'], { cwd: remoteDir, timeout: TIMEOUT_MS })
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['remote', 'add', 'origin', remoteDir])
  const branch = git(['branch', '--show-current']).stdout.trim()
  git(['push', '-q', '-u', 'origin', branch])
  // Large file: >3000 lines triggers the hook's large-diff filtered-pathspec branch
  const bigContent = `${Array.from({ length: 3001 }, (_, i) => `dummy line ${i + 1}`).join('\n')}\n`
  writeFileSync(join(repoDir, 'bigfile.txt'), bigContent)
  // Secret in a security-sensitive file matching `**/migrations/**` and `**/*.sql` pathspecs
  mkdirSync(join(repoDir, 'supabase/migrations'), { recursive: true })
  writeFileSync(
    join(repoDir, 'supabase/migrations/001_init.sql'),
    'sk_live_FAKE_TEST_KEY_1234567890\n',
  )
  git(['add', '-A'])
  git(['commit', '-qm', 'large diff with secret'])
  const upstreamRef = git(['rev-parse', '--abbrev-ref', '@{upstream}']).stdout.trim()
  return { scratch, shimDir, repoDir, upstreamRef }
}

// CONTROL: green
// GROUP: run-security-auditor-always-blocks, run-security-auditor-textconv-filtered-large-diff
// MUTATION: dropping --no-textconv from the large-diff filtered-pathspec call lets a local
// textconv driver empty the SQL file's diff, so the LLM receives no secret and the validating
// shim returns BLOCKED.
test('LLM receives the secret from the filtered diff under a textconv driver (large diff path)', () => {
  const built = setupLargeTextconvUpstreamShimRepo(DIFF_VALIDATING_SHIM)
  // NON-VACUITY: without --no-textconv the textconv driver hides the SQL file's content.
  const hiddenSql = spawnSync(
    'git',
    ['diff', `${built.upstreamRef}...HEAD`, '--', 'supabase/migrations/001_init.sql'],
    { cwd: built.repoDir, encoding: 'utf8', timeout: TIMEOUT_MS },
  )
  const shownSql = spawnSync(
    'git',
    [
      'diff',
      '--no-textconv',
      `${built.upstreamRef}...HEAD`,
      '--',
      'supabase/migrations/001_init.sql',
    ],
    { cwd: built.repoDir, encoding: 'utf8', timeout: TIMEOUT_MS },
  )
  assert.doesNotMatch(hiddenSql.stdout, /sk_live_FAKE_TEST_KEY/)
  assert.match(shownSql.stdout, /sk_live_FAKE_TEST_KEY/)
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Push approved/)
})

// CONTROL: green
// GROUP: run-security-auditor-always-blocks, run-security-auditor-extdiff-filtered-large-diff
// MUTATION: dropping --no-ext-diff from the large-diff filtered-pathspec call lets
// GIT_EXTERNAL_DIFF discard all diff content, so the LLM receives only a stat and the
// validating shim returns BLOCKED.
test('LLM receives the secret from the filtered diff under GIT_EXTERNAL_DIFF (large diff path)', () => {
  const built = setupLargeExtDiffUpstreamShimRepo(DIFF_VALIDATING_SHIM)
  const extEnv = { ...process.env, GIT_EXTERNAL_DIFF: 'true' }
  // NON-VACUITY: without --no-ext-diff, GIT_EXTERNAL_DIFF discards the SQL file's content.
  const hiddenSql = spawnSync(
    'git',
    ['diff', `${built.upstreamRef}...HEAD`, '--', 'supabase/migrations/001_init.sql'],
    { cwd: built.repoDir, encoding: 'utf8', timeout: TIMEOUT_MS, env: extEnv },
  )
  const shownSql = spawnSync(
    'git',
    [
      'diff',
      '--no-ext-diff',
      `${built.upstreamRef}...HEAD`,
      '--',
      'supabase/migrations/001_init.sql',
    ],
    { cwd: built.repoDir, encoding: 'utf8', timeout: TIMEOUT_MS, env: extEnv },
  )
  assert.doesNotMatch(hiddenSql.stdout, /sk_live_FAKE_TEST_KEY/)
  assert.match(shownSql.stdout, /sk_live_FAKE_TEST_KEY/)
  const r = runHookAndCleanup(built, { GIT_EXTERNAL_DIFF: 'true' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Push approved/)
})
