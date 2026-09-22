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
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertUsable } from './spawn.testkit.mjs'

// import.meta.url resolves inside whichever tree runs the suite — the real repo when run
// directly, a throwaway worktree copy when run-mutations.mjs grades a mutation.
const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'run-security-auditor.sh')

const TIMEOUT_MS = 10_000

/** The default uncommitted change — no secret, no `.env`, no `SELECT *`, no `adminClient`. */
const DEFAULT_DIRTY_CONTENT = 'base\nchanged\n'

/**
 * Scaffold a throwaway scratch dir + `claude` PATH shim + `.claude/agents` stub shared by every
 * `setup*ShimRepo()` below. Returns the directories; the caller adds repo-specific content.
 *
 * @param {string} prefix    `mkdtempSync` prefix, distinguishing scratch dirs across setups
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function initShimScratch(prefix, shimBody) {
  const scratch = mkdtempSync(join(tmpdir(), prefix))
  const shimDir = join(scratch, 'shim')
  const repoDir = join(scratch, 'repo')
  mkdirSync(shimDir, { recursive: true })
  mkdirSync(join(repoDir, '.claude/agents'), { recursive: true })
  writeFileSync(join(shimDir, 'claude'), shimBody)
  chmodSync(join(shimDir, 'claude'), 0o755)
  writeFileSync(join(repoDir, '.claude/agents/security-auditor.md'), '# stub auditor prompt\n')
  writeFileSync(join(repoDir, 'file.txt'), 'base\n')
  return { scratch, shimDir, repoDir }
}

/** A `git` runner bound to `repoDir`, shared by every `setup*ShimRepo()` below. */
function gitFactory(repoDir) {
  return (args) => spawnSync('git', args, { cwd: repoDir, encoding: 'utf8', timeout: TIMEOUT_MS })
}

/** `git init` + identity config + a first commit of everything currently on disk. */
function commitInit(git, message = 'init') {
  git(['init', '-q'])
  git(['config', 'user.email', 'test@test.local'])
  git(['config', 'user.name', 'test'])
  git(['add', '-A'])
  git(['commit', '-qm', message])
}

/**
 * Build a throwaway git repo with a `claude` PATH shim running `shimBody`, committed once, then
 * an uncommitted change to `file.txt` holding `dirtyContent` — a non-empty `git diff HEAD`, the
 * no-upstream fallback diff the hook falls back to outside a real PR branch. Returns the repo's
 * directories; the caller is responsible for removing `scratch`.
 *
 * @param {string} shimBody      a full shebang script written to the shim's `claude` executable
 * @param {string} dirtyContent  `file.txt`'s uncommitted content — what the hook's diff carries
 */
function setupShimRepo(shimBody, dirtyContent) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-controls-', shimBody)
  commitInit(gitFactory(repoDir))
  writeFileSync(join(repoDir, 'file.txt'), dirtyContent)
  return { scratch, shimDir, repoDir }
}

/**
 * Spawn the real hook against a prepared repo, with no arguments — the way lefthook's pre-push
 * command runs it. Removes the scratch dir when done, success or failure.
 *
 * @param {{scratch: string, shimDir: string, repoDir: string}} built  a setup*Repo() result
 * @param {Record<string, string>} [extraEnv]  additional env vars for the hook's own process
 */
function runHookAndCleanup({ scratch, shimDir, repoDir }, extraEnv = {}) {
  try {
    const r = spawnSync('bash', [HOOK], {
      cwd: repoDir,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, ...extraEnv },
    })
    assertUsable('run-security-auditor.sh', r, TIMEOUT_MS)
    return r
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * Spawn the real hook inside a fresh shim repo, with no arguments.
 *
 * @param {string} shimBody      a full shebang script written to the shim's `claude` executable
 * @param {string} [dirtyContent]  `file.txt`'s uncommitted content — defaults to no secret/`.env`
 */
function runHookWithShim(shimBody, dirtyContent = DEFAULT_DIRTY_CONTENT) {
  return runHookAndCleanup(setupShimRepo(shimBody, dirtyContent))
}

/**
 * Build a repo where an uncommitted change to `secret.txt` is hidden from `git diff HEAD` by a
 * local `diff.hide.textconv` driver — a repo-local, never-committed config, mirroring an
 * attacker's own machine. `file.txt` also changes so the overall diff isn't emptied outright.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function setupTextconvDirtyShimRepo(shimBody) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-textconv-', shimBody)
  writeFileSync(join(repoDir, '.gitattributes'), 'secret.txt diff=hide\n')
  writeFileSync(join(repoDir, 'secret.txt'), 'base\n')
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['config', 'diff.hide.textconv', 'sh -c true'])
  writeFileSync(join(repoDir, 'file.txt'), 'base\nchanged\n')
  writeFileSync(join(repoDir, 'secret.txt'), 'sk_live_FAKE_TEST_KEY_1234567890\n')
  return { scratch, shimDir, repoDir }
}

/**
 * Build a repo with a real `origin` upstream so `@{upstream}` resolves, then a COMMITTED leak
 * on top — the upstream `"$REMOTE_REF"...HEAD` diff is a commit-to-commit comparison, not a
 * working-tree one, so the secret must land in a real commit to be visible on that path at all.
 * The same local, never-committed `diff.hide.textconv` driver hides it.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function setupUpstreamShimRepo(shimBody) {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-upstream-', shimBody)
  const remoteDir = join(scratch, 'remote.git')
  mkdirSync(remoteDir, { recursive: true })
  writeFileSync(join(repoDir, '.gitattributes'), 'secret.txt diff=hide\n')
  spawnSync('git', ['init', '-q', '--bare'], { cwd: remoteDir, timeout: TIMEOUT_MS })
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['remote', 'add', 'origin', remoteDir])
  const branch = git(['branch', '--show-current']).stdout.trim()
  git(['push', '-q', '-u', 'origin', branch])
  git(['config', 'diff.hide.textconv', 'sh -c true'])
  writeFileSync(join(repoDir, 'file.txt'), 'base\nchanged\n')
  writeFileSync(join(repoDir, 'secret.txt'), 'sk_live_FAKE_TEST_KEY_1234567890\n')
  git(['add', '-A'])
  git(['commit', '-qm', 'leak'])
  const upstreamRef = git(['rev-parse', '--abbrev-ref', '@{upstream}']).stdout.trim()
  return { scratch, shimDir, repoDir, upstreamRef }
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

// Exit 124 is the code `timeout $AUDIT_TIMEOUT_SECS` reports on a kill — this shim never sleeps,
// it just returns that code directly, so the test stays fast under `--jobs` load.
const TIMEOUT_SHIM = `#!/usr/bin/env bash
echo "simulated claude CLI timeout" >&2
exit 124
`

// Any non-zero, non-124 exit takes the CLI-failure branch instead of the timeout branch.
const CLI_FAILURE_SHIM = `#!/usr/bin/env bash
echo "simulated claude CLI failure" >&2
exit 1
`

// An added line matching the fallback scan's secret pattern
// (`eyJ|sk_live_|service_role|-----BEGIN`) — routes the diagnostic scan to "Found N issue(s)"
// instead of falling through to fail_closed_no_llm_output.
const SECRET_DIRTY_CONTENT = 'base\nsk_live_FAKE_TEST_KEY_1234567890\n'

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
  const r = runHookWithShim(TIMEOUT_SHIM, SECRET_DIRTY_CONTENT)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-fallback-scan-cli-failure
// MUTATION: forcing the CLI-failure branch's "Found N issue(s)" `exit 1` to `exit 0` turns a
// failed CLI run with a secret in the diff into an approved push.
test('blocks the push via the fallback scan when the CLI fails and a secret is in the diff', () => {
  const r = runHookWithShim(CLI_FAILURE_SHIM, SECRET_DIRTY_CONTENT)
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /Found \d+ issue\(s\) in fallback scan/)
})

// CONTROL: red
// GROUP: run-security-auditor-always-passes, run-security-auditor-textconv-fallback
// MUTATION: dropping --no-textconv from the no-upstream `git diff HEAD` fallback call lets a
// local textconv driver empty a leaking file's diff, hiding its secret from the fallback scan.
test('fallback scan still finds a secret a textconv driver hides on the no-upstream diff', () => {
  const built = setupTextconvDirtyShimRepo(TIMEOUT_SHIM)
  assertTextconvDriverActive(built.repoDir, ['HEAD'])
  const r = runHookAndCleanup(built)
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
// GROUP: run-security-auditor-always-passes, run-security-auditor-extdiff-fallback
// MUTATION: dropping --no-ext-diff from the no-upstream `git diff HEAD` fallback call lets
// GIT_EXTERNAL_DIFF hide every added line from the fallback scan.
test('fallback scan still finds a secret GIT_EXTERNAL_DIFF hides on the no-upstream diff', () => {
  const built = setupShimRepo(TIMEOUT_SHIM, SECRET_DIRTY_CONTENT)
  const extEnv = { ...process.env, GIT_EXTERNAL_DIFF: 'true' }
  const hidden = spawnSync('git', ['diff', 'HEAD'], {
    cwd: built.repoDir,
    encoding: 'utf8',
    env: extEnv,
  })
  const shown = spawnSync('git', ['diff', '--no-ext-diff', 'HEAD'], {
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
