// Run: node --test .claude/hooks/check-retracted-phrase.base.test.mjs
//
// `--base` (CI) mode: the branch-range path. Split out of check-retracted-phrase.repo.test.mjs
// on 2026-09-14 when that file reached 493 of its 500-line cap and these cases could not be
// added without it — `code-style.md` §1 requires the extraction in the SAME commit as the growth.
//
// This mode is where the guard and its commit-msg counterpart can DIVERGE, so the cases here are
// mostly about the two agreeing: the same waiver, the same corpus, the same answer.
//
// Same MUTATION-PINNED discipline as its sibling; the three deliberately-unpinned mechanisms are
// listed in that file's preamble and are not repeated here.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-retracted-phrase.mjs')

/** A throwaway repo, removed however the body exits. */
function withRepo(fn) {
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
function run({ dir }, message, args) {
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
function seedFlagship({ git, write }) {
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

test('--base mode honours a waiver written in the commit that needed it', () => {
  // MUTATION: stop passing each commit's own message into checkCommit in --base mode (leave it
  // '') → a commit legitimately waived at commit-msg re-fires in CI with no waiver reachable, and
  // the required check is blocked permanently. Its only remedies would be deleting correct corpus
  // text or disabling the step, which is how a gate gets switched off for good.
  withRepo((r) => {
    seedFlagship(r) // already commits
    const base = r.git('rev-parse', 'HEAD').trim()
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    r.git(
      'commit',
      '-qm',
      'fix: correct the count\n\nRetracted-ok: 1807 — the guard fixture pins the pre-fix value on purpose',
    )
    assert.equal(run(r, null, ['--base', base]).status, 0)
  })
})

test("--base mode does not let one commit's waiver clear another commit's finding", () => {
  // MUTATION: concatenate every range commit's message into ONE waiver map (the obvious way to
  // implement --base waivers) → the waiver below, written for a DIFFERENT file's retraction,
  // silently clears an unrelated finding carrying the same token. parseWaivers keys on the token
  // alone, so the hatch would widen from "this commit, this token" to "anywhere in the range".
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807 here" }\n')
    r.write('docs/a.md', 'the value 1807 also appears here\n')
    r.write('docs/b.md', 'and the value 1807 appears here too\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'base')
    const base = r.git('rev-parse', 'HEAD').trim()

    // Commit 1 retracts 1807 from limits.json and waives it, naming its own reason.
    r.write('.claude/limits.json', '{ "note": "value 1806 here" }\n')
    r.git('add', '-A')
    r.git(
      'commit',
      '-qm',
      'fix: correct limits\n\nRetracted-ok: 1807 — limits.json is the canonical source and the docs quote it deliberately',
    )

    // Commit 2 retracts the SAME token from a different file and waives NOTHING.
    r.write('docs/a.md', 'the value 1806 also appears here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix: correct docs/a.md with no waiver')

    const { status, stderr } = run(r, null, ['--base', base])
    assert.equal(status, 1, "commit 2's finding must survive commit 1's waiver")
    assert.match(stderr, /docs\/a\.md/)
  })
})

test('an intermediate commit is graded against its OWN tree, not HEAD', () => {
  // MUTATION: make grepScope always return ['--cached'] → every commit in the range is graded
  // against HEAD instead of its own tree. Invisible in a single-commit range, because there the
  // last commit IS HEAD; it only bites on an INTERMEDIATE commit whose survivor a LATER commit
  // has already cleaned up. The guard then reports no survivor for a commit that genuinely had
  // one, and CI passes a retraction that was incomplete when it was made (fail-OPEN).
  withRepo((r) => {
    r.write('docs/a.md', 'the generated file is 1807 lines\n')
    r.write('docs/b.md', 'and elsewhere: 1807 lines again\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    const base = r.git('rev-parse', 'HEAD').trim()

    // Commit 1 retracts the token from a.md while b.md still carries it — incomplete, no waiver.
    r.write('docs/a.md', 'the generated file is 1806 lines\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix: correct a.md only')

    // Commit 2 tidies b.md, so at HEAD the survivor is gone.
    r.write('docs/b.md', 'and elsewhere: 1806 lines again\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'chore: tidy b.md')

    const { status, stderr } = run(r, null, ['--base', base])
    assert.equal(status, 1, "commit 1's incomplete retraction must still be reported")
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('a completed spec stays excluded in --base mode, exactly as at commit-msg', () => {
  // MUTATION: pass a `*/tasks.md` glob to listTracked's ls-tree branch → `git ls-tree` matches the
  // `*` LITERALLY and returns nothing, so completedSpecDirs() yields [] and no spec is ever
  // excluded in CI. That is a DIVERGENCE bug rather than a fail-open: the commit passes the
  // commit-msg hook, where ls-files does expand the glob, and then fails CI on a token surviving
  // only in a historical record. Verified: ls-tree 0 hits vs ls-files 19 on the same pathspec.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807" }\n')
    r.write('.spec-workflow/specs/done/tasks.md', '- [x] finished\nthe value 1807 was used\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    const base = r.git('rev-parse', 'HEAD').trim()

    r.write('.claude/limits.json', '{ "note": "value 1806" }\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix: correct the value')

    assert.equal(
      run(r, null, ['--base', base]).status,
      0,
      'a completed spec must not count as a survivor in --base mode either',
    )
  })
})
