// Repo-config fixtures for the §7 test-title impl-leakage guard: a textconv driver, an external
// diff driver, `diff.noprefix`, and `color.ui` can each hide or rewrite the diff text a naive `git
// diff` would return. DIFF_ARGS (.claude/hooks/diff-parse.mjs) defends against all four; this
// suite proves each config is genuinely ACTIVE without the flag (code-style.md §7 "construct the
// failing configuration"), then proves the guard still catches the violation with it.
//
// Run: node --test .claude/hooks/check-test-title-leakage.repo.test.mjs
//
// Every case is MUTATION-PINNED — see the `// GROUP:` marker and
// check-test-title-leakage.mutations.json. `node .claude/hooks/run-mutations.mjs --guard
// check-test-title-leakage` re-derives the claims: each `-diff-args-dropped` mutation drops the
// WHOLE `...DIFF_ARGS` spread at one call site, which necessarily drops every flag it carries —
// a single mutation is enough to prove the call site threads the array through at all. A single
// flag's own presence inside DIFF_ARGS is pinned separately, at the array itself, in
// diff-parse.mutations.json's `*-flag-dropped` entries (graded by diff-parse.test.mjs).

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'check-test-title-leakage.mjs')
const TIMEOUT_MS = 10_000
const VIOLATION = "it('maps admin_not_found', () => {})\n"

/** A throwaway one-commit repo, isolated from the runner's global git config. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'test-title-leak-repo-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', join(dir, '.git', 'no-hooks'))
  writeFileSync(join(dir, 'base.txt'), 'x\n')
  git('add', '-A')
  git('commit', '-qm', 'init')
  return { dir, git }
}

/** The raw (no DIFF_ARGS) staged diff text for one file — what a naive `git diff --cached` sees. */
function rawStagedDiff({ git }, file) {
  return git('diff', '--cached', '-U0', '--', file)
}

/** The raw (no DIFF_ARGS) CI-range diff text — what a naive `git diff <base>...HEAD` sees. */
function rawCiDiff({ git }, base) {
  return git('diff', `${base}...HEAD`, '-U0')
}

function runStaged(dir, file) {
  return runNode('check-test-title-leakage.mjs', [HOOK, file], { cwd: dir, timeout: TIMEOUT_MS })
}

function runCi(dir, base) {
  return runNode('check-test-title-leakage.mjs', [HOOK, '--base', base], {
    cwd: dir,
    timeout: TIMEOUT_MS,
  })
}

// ---------------------------------------------------------------- textconv (staged)

// GROUP: staged-diff-args-dropped
test('staged mode still blocks under a textconv driver that empties the diff', () => {
  const r = makeRepo()
  try {
    writeFileSync(join(r.dir, '.gitattributes'), '*.test.ts diff=hide\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'attrs')
    r.git('config', 'diff.hide.textconv', 'sh -c true')
    writeFileSync(join(r.dir, 'sample.test.ts'), VIOLATION)
    r.git('add', 'sample.test.ts')

    // NON-VACUITY: without --no-textconv, `sh -c true` prints nothing, so the raw diff carries
    // no added line at all — the config really does hide the content.
    assert.doesNotMatch(rawStagedDiff(r, 'sample.test.ts'), /\+\s*it\(/)

    // MUTATION: drop the `...DIFF_ARGS` spread from the staged diff call (drops --no-textconv
    // along with every other flag) → the guard's own diff is run through the same driver, sees
    // no added line, and a disallowed title passes silently.
    const res = runStaged(r.dir, 'sample.test.ts')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /test-title impl-leakage guard/)
  } finally {
    rmSync(r.dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------- external diff (staged)

// GROUP: staged-diff-args-dropped
test('staged mode still blocks under an external diff driver that discards the diff', () => {
  const r = makeRepo()
  try {
    r.git('config', 'diff.external', 'true')
    writeFileSync(join(r.dir, 'sample.test.ts'), VIOLATION)
    r.git('add', 'sample.test.ts')

    // NON-VACUITY: the external driver `true` prints nothing on its own stdout, so the raw
    // diff carries no added line — the config really does discard the content.
    assert.doesNotMatch(rawStagedDiff(r, 'sample.test.ts'), /\+\s*it\(/)

    // MUTATION: drop the `...DIFF_ARGS` spread from the staged diff call (drops --no-ext-diff
    // along with every other flag) → the guard's own diff is handed to the external driver,
    // which never prints the added line, and a disallowed title passes silently.
    const res = runStaged(r.dir, 'sample.test.ts')
    assert.equal(res.status, 1)
    assert.match(res.stderr, /test-title impl-leakage guard/)
  } finally {
    rmSync(r.dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------- diff.noprefix (CI / --base)

// GROUP: ci-diff-args-dropped
test('--base mode still blocks under diff.noprefix=true (no a/ b/ headers)', () => {
  const r = makeRepo()
  try {
    // `${base}...HEAD` is a two-treeish comparison: diff.mnemonicPrefix never applies to it (only
    // an index/working-tree-relative diff gets the i/w/c swap), but diff.noprefix DOES, dropping
    // the `a/`/`b/` prefixes entirely.
    r.git('config', 'diff.noprefix', 'true')
    const base = r.git('rev-parse', 'HEAD').trim()
    // The `**/*.test.ts` pathspec only matches inside a subdirectory on this git version — a
    // root-level file is invisible to it regardless of the prefix fix, so nest the fixture.
    mkdirSync(join(r.dir, 'sub'), { recursive: true })
    writeFileSync(join(r.dir, 'sub', 'sample.test.ts'), VIOLATION)
    r.git('add', '-A')
    r.git('commit', '-qm', 'add a violating title')

    // NON-VACUITY: the raw header carries no a/ b/ prefix at all.
    assert.doesNotMatch(rawCiDiff(r, base), /^diff --git a\//m)

    // MUTATION: drop the `...DIFF_ARGS` spread from the CI range diff call (drops the src/dst
    // prefixes along with every other flag) → splitByFile's a/-b/-anchored header regex matches
    // zero files under diff.noprefix, and a disallowed title added in the PR range passes silently.
    const res = runCi(r.dir, base)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /test-title impl-leakage guard/)
  } finally {
    rmSync(r.dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------- color.ui (CI / --base)

// GROUP: ci-diff-args-dropped
test('--base mode still blocks under color.ui=always (ANSI-coloured diff)', () => {
  const r = makeRepo()
  try {
    r.git('config', 'color.ui', 'always')
    const base = r.git('rev-parse', 'HEAD').trim()
    mkdirSync(join(r.dir, 'sub'), { recursive: true })
    writeFileSync(join(r.dir, 'sub', 'sample.test.ts'), VIOLATION)
    r.git('add', '-A')
    r.git('commit', '-qm', 'add a violating title')

    // NON-VACUITY: the raw diff carries ANSI escape codes.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ANSI escape is present
    assert.match(rawCiDiff(r, base), /\x1b\[/)

    // MUTATION: drop the `...DIFF_ARGS` spread from the CI range diff call (drops --no-color
    // along with every other flag) → the header and added lines carry ANSI escapes, splitByFile's
    // header regex matches nothing, and a disallowed title in the PR range passes silently.
    const res = runCi(r.dir, base)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /test-title impl-leakage guard/)
  } finally {
    rmSync(r.dir, { recursive: true, force: true })
  }
})
