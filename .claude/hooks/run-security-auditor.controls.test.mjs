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

/**
 * Build a throwaway git repo with a `claude` PATH shim running `shimBody`, then spawn the real
 * hook inside it with no arguments — the way lefthook's pre-push command runs it.
 *
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
function runHookWithShim(shimBody) {
  const scratch = mkdtempSync(join(tmpdir(), 'sec-aud-controls-'))
  const shimDir = join(scratch, 'shim')
  const repoDir = join(scratch, 'repo')
  try {
    mkdirSync(shimDir, { recursive: true })
    mkdirSync(join(repoDir, '.claude/agents'), { recursive: true })
    writeFileSync(join(shimDir, 'claude'), shimBody)
    chmodSync(join(shimDir, 'claude'), 0o755)
    writeFileSync(join(repoDir, '.claude/agents/security-auditor.md'), '# stub auditor prompt\n')
    writeFileSync(join(repoDir, 'file.txt'), 'base\n')

    const git = (args) =>
      spawnSync('git', args, { cwd: repoDir, encoding: 'utf8', timeout: TIMEOUT_MS })
    git(['init', '-q'])
    git(['config', 'user.email', 'test@test.local'])
    git(['config', 'user.name', 'test'])
    git(['add', '-A'])
    git(['commit', '-qm', 'init'])
    // Uncommitted change after the initial commit → a non-empty `git diff HEAD`, the
    // no-upstream fallback diff the hook falls back to outside a real PR branch.
    writeFileSync(join(repoDir, 'file.txt'), 'base\nchanged\n')

    const r = spawnSync('bash', [HOOK], {
      cwd: repoDir,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}` },
    })
    assertUsable('run-security-auditor.sh', r, TIMEOUT_MS)
    return r
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
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
