// Shared fixtures for the retracted-phrase guard's git-facing suites.
//
// Extracted at the THIRD copy (`code-style.md` § Extract at 3 Repetitions). Not a guard and not a
// suite: it defines no tests, so it needs no `ci.yml` step — the three suites that import it each
// have one, and a break here turns all three red at once, which is the point.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-retracted-phrase.mjs')

/** A throwaway repo, removed however the body exits. */
export function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'retracted-phrase-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    git('init', '-q', '.')
    git('config', 'user.email', 't@example.com')
    git('config', 'user.name', 'Test')
    const write = (rel, body) => {
      mkdirSync(join(dir, dirname(rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    return fn({ dir, git, write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Run the guard with `message`, returning {status, stderr}. */
export function run({ dir }, message, args) {
  const msgFile = join(dir, '.git', 'COMMIT_EDITMSG')
  writeFileSync(msgFile, message ?? 'chore: x\n')
  try {
    execFileSync('node', [GUARD, ...(args ?? [msgFile])], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stderr: '' }
  } catch (err) {
    return { status: err.status, stderr: err.stderr ?? '' }
  }
}

/** The flagship: a value corrected in one corpus file, left standing in another. */
export function seedFlagship({ git, write }) {
  write(
    '.claude/limits.json',
    '{ "note": "types.ts is GENERATED (1807 lines) - the generator owns it" }\n',
  )
  write(
    '.claude/hooks/check-file-size-guard.test.mjs',
    '// a 1807-line GENERATED file is reported\n',
  )
  write(
    '.claude/agent-memory/code-reviewer/MEMORY.md',
    '| drift | types.ts cited as "1807-line" - actual 1806 |\n',
  )
  git('add', '-A')
  git('commit', '-qm', 'init')
}
