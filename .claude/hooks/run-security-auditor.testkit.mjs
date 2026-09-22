// Shared fixtures for run-security-auditor.sh's spawned graded-control suites
// (run-security-auditor.controls.test.mjs, run-security-auditor.config.test.mjs).
//
// Not a guard and not a suite: it defines no tests, so it needs no `ci.yml` step of its own —
// each importing suite has one. Importing a `.test.mjs` file re-registers and re-runs its tests;
// this file exists so neither suite has to import the other to reach these helpers.

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertUsable } from './spawn.testkit.mjs'

// import.meta.url resolves inside whichever tree runs the suite — the real repo when run
// directly, a throwaway worktree copy when run-mutations.mjs grades a mutation.
export const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'run-security-auditor.sh')

export const TIMEOUT_MS = 10_000

/**
 * Scaffold a throwaway scratch dir + `claude` PATH shim + `.claude/agents` stub shared by every
 * `setup*ShimRepo()` in the importing suites. Returns the directories; the caller adds
 * repo-specific content.
 *
 * @param {string} prefix    `mkdtempSync` prefix, distinguishing scratch dirs across setups
 * @param {string} shimBody  a full shebang script written to the shim's `claude` executable
 */
export function initShimScratch(prefix, shimBody) {
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

/** A `git` runner bound to `repoDir`, shared by every `setup*ShimRepo()` in the importing suites. */
export function gitFactory(repoDir) {
  return (args) => spawnSync('git', args, { cwd: repoDir, encoding: 'utf8', timeout: TIMEOUT_MS })
}

/** `git init` + identity config + a first commit of everything currently on disk. */
export function commitInit(git, message = 'init') {
  git(['init', '-q'])
  git(['config', 'user.email', 'test@test.local'])
  git(['config', 'user.name', 'test'])
  git(['add', '-A'])
  git(['commit', '-qm', message])
}

/**
 * Spawn the real hook against a prepared repo, with no arguments — the way lefthook's pre-push
 * command runs it. Removes the scratch dir when done, success or failure.
 *
 * @param {{scratch: string, shimDir: string, repoDir: string}} built  a setup*Repo() result
 * @param {Record<string, string>} [extraEnv]  additional env vars for the hook's own process
 */
export function runHookAndCleanup({ scratch, shimDir, repoDir }, extraEnv = {}) {
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

// Exit 124 is the code `timeout $AUDIT_TIMEOUT_SECS` reports on a kill — this shim never sleeps,
// it just returns that code directly, so tests using it stay fast under `--jobs` load.
export const TIMEOUT_SHIM = `#!/usr/bin/env bash
echo "simulated claude CLI timeout" >&2
exit 124
`
