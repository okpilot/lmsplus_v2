// Shared fixtures for the check-decisions-ledger suites.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

export const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-decisions-ledger.mjs')
export const GOOD_REASON = 'because this is a genuinely safe correction'

export const LEDGER_V1 =
  '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision.\n'

export const E16_MASTER = '## 16 — 2026-03-12 — a master decision.'

/** A ledger with decision 14/15 bodies and any extra entry lines. */
export function ledger(e14 = 'first decision.', e15 = 'second decision.', extra = []) {
  const lines = [`## 14 — 2026-03-11 — ${e14}`, `## 15 — 2026-03-11 — ${e15}`, ...extra]
  return `# Decisions\n\n> rule text\n\n${lines.join('\n')}\n`
}

/** A ledger with only decision 15 and any extra entry lines (14 absent). */
export function ledgerNo14(extra = []) {
  const lines = ['## 15 — 2026-03-11 — second decision.', ...extra]
  return `# Decisions\n\n> rule text\n\n${lines.join('\n')}\n`
}

/** A throwaway repo, removed however the body exits. */
export function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'decisions-ledger-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    git('init', '-q', '.')
    git('config', 'user.email', 't@example.com')
    git('config', 'user.name', 'Test')
    // Isolate from the RUNNER's global git config — see check-md-allowlist.repo.test.mjs for
    // why both lines are needed (signing key demand, someone else's hooksPath).
    git('config', 'commit.gpgsign', 'false')
    git('config', 'core.hooksPath', join(dir, '.git', 'no-hooks'))
    const write = (rel, body) => {
      mkdirSync(join(dir, dirname(rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    /** `git` with both author and committer date pinned to `date`. */
    const gitAt = (date, ...args) =>
      execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      })
    return fn({ dir, git, gitAt, write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- spawned: merge commits

/** Spawns the guard's `--base <ref>` mode against a `withRepo` fixture. */
export function runBase({ dir }, ref) {
  return runNode('check-decisions-ledger', [GUARD, '--base', ref], { cwd: dir })
}

export function commit(r, text, message) {
  r.write('docs/decisions.md', text)
  r.git('add', '-A')
  r.git('commit', '-qm', message)
}

export function readme(r, text = 'unrelated\n') {
  r.write('README.md', text)
  r.git('add', '-A')
  r.git('commit', '-qm', 'readme')
}

export const waive = (token, subject) => `${subject}\n\nLedger-edit-ok: ${token} — ${GOOD_REASON}`

/** Commit `base` on `master`, then check out a new `work` branch. */
export function startWork(r, base = LEDGER_V1) {
  commit(r, base, 'init')
  r.git('branch', '-m', 'master')
  r.git('checkout', '-qb', 'work')
}

/** `work` forks from `base` and runs `onWork`; master then commits `master` (default: + 16). */
export function forked(
  r,
  onWork,
  { base, master = ledger(undefined, undefined, [E16_MASTER]) } = {},
) {
  startWork(r, base)
  onWork()
  r.git('checkout', '-q', 'master')
  commit(r, master, 'master commit')
  r.git('checkout', '-q', 'work')
}

/** Merge master into the current branch, resolving the ledger to `text`. */
export function mergeMaster(r, text) {
  try {
    r.git('merge', '-q', '--no-ff', '--no-commit', 'master')
  } catch {
    // A ledger conflict is expected in some fixtures; the resolution below overwrites it.
  }
  commit(r, text, 'Merge branch master into work')
}
