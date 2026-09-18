// CLI + live-tree tests for the file-size guard. Split out of the unit suite when the
// combined file crossed the test-file cap that this very guard enforces —
// baselining it would have been the "widen the rule to fit my own code" move the
// programme exists to stop. Run:
//   node --test .claude/hooks/check-file-size-guard.cli.test.mjs
//
// Every case below is MUTATION-PINNED: break the named mechanism in
// check-file-size-guard.mjs (or .claude/limits.json) and that case — or the named GROUP of cases sharing that mechanism — goes red.
// Not "exactly one": several mechanisms here are pinned by a PAIR, and the stricter wording
// was false of this file. Do not restore it without re-running the mutations.
// The mutation each case pins is named in its title, because a test whose mechanism
// nothing exercises is a lie you will later trust.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const lines = (n) => `${'x\n'.repeat(n)}`

// ----------------------------------------------------------------- fail closed

// GROUP: cli-limits-read-failure-exits-zero
test('blocks rather than passes when the limits file cannot be read', () => {
  // MUTATION: change the catch to exit(0) → the guard reports clean forever the moment
  // anything breaks, and nobody looks again. This is the failure mode that made
  // check-mirror-sync.mjs necessary: five shipped fail-opens, each silently passing.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const empty = mkdtempSync(join(tmpdir(), 'file-size-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: empty })
    let code = 0
    try {
      execFileSync('node', [guard], { cwd: empty, stdio: 'pipe' })
    } catch (err) {
      code = err.status
    }
    assert.equal(code, 1, 'a guard that cannot read its config must BLOCK')
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

// --------------------------------------------------------------- CLI (main())

// GROUP: cli-scoped-filter-dropped
test('only a violation among the files passed as arguments can block the commit', () => {
  // MUTATION: replace the scoped/all ternary with `const scoped = all` → staged mode
  // stops meaning anything, and a violation in a file the commit never touched blocks
  // it anyway.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-staged-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({
        rules: [{ kind: 'util', glob: '**/*.ts', max: 1 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'a.ts'), lines(3)) // violates max: 1
    writeFileSync(join(repo, 'b.ts'), lines(1)) // compliant
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const run = (args) => spawnSync('node', [guard, ...args], { cwd: repo, encoding: 'utf8' })

    assert.equal(run([]).status, 1, 'whole-tree mode sees a.ts and fails')
    assert.equal(run(['b.ts']).status, 0, 'a.ts was not passed, so it cannot block')
    assert.equal(run(['a.ts']).status, 1, 'a.ts WAS passed, so it blocks')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// GROUP: cli-ls-files-drop-z
test('a non-ASCII tracked filename does not block every run', () => {
  // MUTATION: drop `-z` from trackedFiles' `git ls-files` → red. core.quotePath defaults to
  // true, so git renders the path as the literal `"\303\251.ts"`; readFile gets ENOENT on that
  // string and the guard records an unreadable regression, which returns BEFORE the baseline is
  // consulted — so no baseline row can ever clear it and one accented file in the tree blocks
  // every commit repo-wide. Found by CodeRabbit; the guard's own suites all used ASCII fixtures.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-utf8-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({
        rules: [{ kind: 'util', glob: '**/*.ts', max: 5 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'e\u0301clair.ts'), lines(1)) // compliant, and non-ASCII
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const run = spawnSync('node', [guard], { cwd: repo, encoding: 'utf8' })
    assert.equal(
      run.status,
      0,
      `a compliant non-ASCII path must not block: ${run.stdout}${run.stderr}`,
    )
    assert.ok(
      !/unreadable|ENOENT/i.test(run.stdout + run.stderr),
      `the accented path must be read, not reported unreadable: ${run.stdout}${run.stderr}`,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// GROUP: cli-staged-deletion-drop-z
test('removing a non-ASCII file does not read as an unknown path', () => {
  // MUTATION: drop `-z` from the staged-deletion `git diff` → red. The mirror image of the
  // trackedFiles case: git hands back the QUOTED deletion path while lefthook passes the raw
  // one, so the deleted-set membership test misses and the commit is rejected as naming a path
  // that is not tracked. Staged deletions are absent from `git ls-files` by definition, so that
  // set is the only thing that admits them.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-utf8-del-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({
        rules: [{ kind: 'util', glob: '**/*.ts', max: 5 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    const accented = 'e\u0301clair.ts'
    writeFileSync(join(repo, accented), lines(1))
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'seed'], { cwd: repo })
    execFileSync('git', ['rm', '-q', accented], { cwd: repo })

    const run = spawnSync('node', [guard, accented], { cwd: repo, encoding: 'utf8' })
    assert.equal(
      run.status,
      0,
      `removing a tracked non-ASCII file must not block: ${run.stdout}${run.stderr}`,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// GROUP: cli-tracked-files-decoded-as-utf8
test('a tracked path whose bytes are not valid UTF-8 is still graded', () => {
  // MUTATION: restore `encoding: 'utf8'` on trackedFiles' git call and split the string on
  // '\0' → red. A git path is arbitrary bytes on Linux; an invalid sequence decodes to U+FFFD,
  // and readFile on THAT string gets ENOENT. The guard then calls the file unreadable, and that
  // branch returns before the baseline is consulted — so the file can never be cleared and every
  // commit in the repo blocks. `-z` fixed the QUOTING; only raw bytes fix the DECODE.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-badenc-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({
        rules: [{ kind: 'util', glob: '**/*.ts', max: 5 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    // 0x80 is a continuation byte with no lead byte — invalid UTF-8, and a legal filename.
    const badName = Buffer.concat([Buffer.from('bad'), Buffer.from([0x80]), Buffer.from('.ts')])
    writeFileSync(Buffer.concat([Buffer.from(`${repo}/`), badName]), lines(1))
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const run = spawnSync('node', [guard], { cwd: repo, encoding: 'utf8' })
    const out = run.stdout + run.stderr
    assert.equal(run.status, 0, `a compliant invalid-UTF-8 path must not block: ${out}`)
    assert.ok(!/unreadable/i.test(out), `it must be READ, not called unreadable: ${out}`)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// GROUP: cli-staged-mode-reads-worktree
test('staged mode grades the INDEX, not the working tree', () => {
  // MUTATION: read the scoped paths from the worktree again (drop the fromIndex branch) → red.
  // git commits the index. Staging an over-limit file and then trimming the worktree copy
  // without re-staging let the ratchet pass while the over-limit version was committed — a
  // fail-open in the gate, found by CodeRabbit at CR-local round 3 after eight internal passes.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-index-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({
        rules: [{ kind: 'util', glob: '**/*.ts', max: 5 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'big.ts'), lines(9)) // over the cap of 5
    execFileSync('git', ['add', '-A'], { cwd: repo })
    writeFileSync(join(repo, 'big.ts'), lines(2)) // ...but the WORKTREE now looks compliant

    const run = spawnSync('node', [guard, 'big.ts'], { cwd: repo, encoding: 'utf8' })
    const out = run.stdout + run.stderr
    assert.equal(run.status, 1, `the staged 9-line version is what gets committed: ${out}`)
    assert.match(out, /9 lines/, 'it must report the INDEX line count, not the worktree one')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// GROUP: cli-index-read-prefers-longer-side
test('staged mode does not launder a worktree-only regression through the index', () => {
  // MUTATION: read whichever of the index/worktree content is LONGER (e.g. block if either
  // is over the cap) instead of the index alone → red. That alternate shape still blocks the
  // sibling test above (the index content is the larger one there), so this is a genuinely
  // separate case: the index must be authoritative in BOTH directions, not just the one that
  // blocks — an unstaged worktree edit must never fail a commit that never touches it.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-index-safe-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({
        rules: [{ kind: 'util', glob: '**/*.ts', max: 5 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'small.ts'), lines(2)) // compliant when staged
    execFileSync('git', ['add', '-A'], { cwd: repo })
    writeFileSync(join(repo, 'small.ts'), lines(9)) // unstaged worktree edit, over the cap

    const run = spawnSync('node', [guard, 'small.ts'], { cwd: repo, encoding: 'utf8' })
    assert.equal(run.status, 0, 'the staged 2-line version is what gets committed')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// GROUP: cli-stale-plural-hardcoded
test('reports stale baseline entries in the singular and plural, and blocks on them', () => {
  // MUTATION: hardcode the 'ies' suffix regardless of stale.length → a report with one
  // stale entry reads "1 stale baseline entries", invisible to the exit code so nothing
  // else would ever catch the copy-editing regression.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const makeRepo = (baseline) => {
    const repo = mkdtempSync(join(tmpdir(), 'file-size-stale-msg-'))
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({ rules: [], excludeBasenamePatterns: [], excludeGlobs: [], baseline }),
    )
    return repo
  }

  const one = makeRepo({ 'gone.ts': 90 })
  try {
    const result = spawnSync('node', [guard], { cwd: one, encoding: 'utf8' })
    assert.equal(result.status, 1) // stale entries BLOCK: a rename out of a rule class is otherwise silent
    assert.match(result.stderr, /1 stale baseline entry in/)
    assert.doesNotMatch(result.stderr, /1 stale baseline entries/)
  } finally {
    rmSync(one, { recursive: true, force: true })
  }

  const two = makeRepo({ 'gone.ts': 90, 'also-gone.ts': 90 })
  try {
    const result = spawnSync('node', [guard], { cwd: two, encoding: 'utf8' })
    assert.equal(result.status, 1) // stale entries BLOCK: a rename out of a rule class is otherwise silent
    assert.match(result.stderr, /2 stale baseline entries in/)
  } finally {
    rmSync(two, { recursive: true, force: true })
  }
})

// GROUP: cli-ls-files-maxbuffer-dropped
test("keeps working when the tracked-file listing is bigger than node's default buffer cap", () => {
  // MUTATION: drop `maxBuffer: 64 * 1024 * 1024` from the git ls-files call. This repo's
  // OWN `git ls-files` output is tiny (~100KB), so the check against the live tree can
  // never catch a maxBuffer regression — a synthetic tree is required. Nesting (3 levels of
  // a 250-char segment) plus enough files reaches a >1MB listing, which exceeds node's ~1MB
  // default execFileSync buffer. Depth is capped at 3 because the absolute fixture path must
  // stay under macOS's PATH_MAX of 1024 — an earlier 9-level chain ran ~2250 chars and threw
  // ENAMETOOLONG there while passing on Linux (PATH_MAX 4096), so CI never saw it. The
  // >1MB assertion below is what keeps the smaller tree honest. Without the override, git ls-files
  // throws ENOBUFS and the whole check fails closed even though nothing is over any
  // limit.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-bigtree-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({ rules: [], excludeBasenamePatterns: [], excludeGlobs: [], baseline: {} }),
    )
    let chain = repo
    for (let i = 0; i < 3; i++) chain = join(chain, 'a'.repeat(250))
    mkdirSync(chain, { recursive: true })
    for (let i = 0; i < 1600; i++) {
      writeFileSync(join(chain, `f${String(i).padStart(6, '0')}.dat`), '')
    }
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const listing = execFileSync('git', ['ls-files'], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    assert.ok(listing.length > 1024 * 1024, 'fixture must exceed the 1MB default to be a real test')

    const result = spawnSync('node', [guard], { cwd: repo, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// ---------------------------------------- the rename-out-of-rule-class escape

// GROUP: cli-stale-only-run-advisory
test('renaming a grandfathered file out of its rule class is blocked, not silently allowed', () => {
  // MUTATION: make a stale baseline entry advisory again (`return 0` when only stale rows
  // exist) → red. This is the rename escape: `git mv foo.ts foo.test.ts` moves a Server Action
  // onto the far looser test-file rule, `use-x.ts` -> `x.ts` moves a hook onto the utility
  // rule, and a `.config.` infix removes it from scope entirely. Classification is
  // derived from the PATH, and the baseline is keyed on the PATH, so the only trace was the
  // old entry going stale — which read as "resolved". Reproduced end to end before the fix.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-rename-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    mkdirSync(join(repo, '.claude', 'hooks'), { recursive: true })
    mkdirSync(join(repo, 'src'), { recursive: true })
    copyFileSync(
      join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs'),
      join(repo, '.claude/hooks/check-file-size-guard.mjs'),
    )
    writeFileSync(
      join(repo, '.claude/limits.json'),
      JSON.stringify({
        rules: [
          { kind: 'test file', glob: '**/*.test.*', max: 500 },
          { kind: 'utility/helper', glob: '**/*.ts', max: 100 },
        ],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: { 'src/big.ts': 150 },
      }),
    )
    writeFileSync(join(repo, 'src/big.ts'), 'x\n'.repeat(150))
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const run = () =>
      spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs'], {
        cwd: repo,
        encoding: 'utf8',
      })
    assert.equal(run().status, 0, 'the grandfathered file at its recorded size must pass')

    // the escape: same content, new name, now graded against the test-file rule
    execFileSync('git', ['mv', 'src/big.ts', 'src/big.test.ts'], { cwd: repo })
    execFileSync('git', ['add', '-A'], { cwd: repo })
    const after = run()
    assert.equal(after.status, 1, 'renaming out of the rule class must block')
    assert.match(after.stderr, /stale baseline entr/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// -------------------------------------------------- the live tree stays green

test('the current tracked tree has no regression against the committed baseline', () => {
  // Guards the baseline itself: if someone edits limits.json by hand and gets a number
  // wrong, or a grandfathered file grows, this goes red without waiting for a commit.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  let code = 0
  try {
    execFileSync('node', [guard], { stdio: 'pipe' })
  } catch (err) {
    code = err.status
  }
  assert.equal(code, 0)
})
