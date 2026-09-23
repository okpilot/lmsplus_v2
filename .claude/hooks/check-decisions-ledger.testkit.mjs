// Shared fixtures for the check-decisions-ledger suites.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-decisions-ledger.mjs')
export const GOOD_REASON = 'because this is a genuinely safe correction'

export const LEDGER_V1 =
  '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision.\n'

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
