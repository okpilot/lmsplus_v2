// CLI + live-tree tests for the file-size guard. Split out of the unit suite when the
// combined file crossed the test-file cap that this very guard enforces —
// baselining it would have been the "widen the rule to fit my own code" move the
// programme exists to stop. Run:
//   node --test .claude/hooks/check-file-size-guard.cli.test.mjs
//
// Every case below is MUTATION-PINNED: break the named mechanism in
// check-file-size-guard.mjs (or .claude/limits.json) and exactly one test goes red.
// The mutation each case pins is named in its title, because a test whose mechanism
// nothing exercises is a lie you will later trust.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const lines = (n) => `${'x\n'.repeat(n)}`

// ----------------------------------------------------------------- fail closed

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

test("keeps working when the tracked-file listing is bigger than node's default buffer cap", () => {
  // MUTATION: drop `maxBuffer: 64 * 1024 * 1024` from the git ls-files call. This repo's
  // OWN `git ls-files` output is tiny (~100KB), so the check against the live tree can
  // never catch a maxBuffer regression — a synthetic tree is required. Deep nesting
  // (9 levels of a 250-char segment) reaches a >1MB listing with only ~1200 files, which
  // exceeds node's ~1MB default execFileSync buffer. Without the override, git ls-files
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
    for (let i = 0; i < 9; i++) chain = join(chain, 'a'.repeat(250))
    mkdirSync(chain, { recursive: true })
    for (let i = 0; i < 1200; i++) {
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

// ------------------------------------------------- the two-branch stderr trailer

test('prints split-file guidance for a normal violation, not the unreadable-path one', () => {
  // MUTATION: swap `.some((r) => r.n !== null)` for `.some((r) => r.n === null)` on the
  // first trailer block → this scenario has no null-n regression, so the split-file
  // guidance silently stops printing for the one class of regression a developer can
  // actually act on by editing the source file.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-trailer-normal-'))
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
    writeFileSync(join(repo, 'a.ts'), lines(3)) // violates max: 1, not baselined
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const result = spawnSync('node', [guard], { cwd: repo, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /3 lines — util limit is 1 \(new violation\)/)
    assert.match(result.stderr, /Split the file/)
    assert.doesNotMatch(result.stderr, /unreadable tracked path/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('prints unreadable-path guidance for a dangling symlink, not the split-file one', () => {
  // MUTATION: swap the second trailer block's predicate to `.some((r) => r.n !== null)`
  // → this scenario has no non-null-n regression, so the dangling-symlink guidance
  // silently stops printing for the one class of regression that CANNOT be fixed by
  // splitting the file — leaving a developer with only "Split the file" advice for a
  // problem splitting cannot solve.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-trailer-unreadable-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({ rules: [], excludeBasenamePatterns: [], excludeGlobs: [], baseline: {} }),
    )
    symlinkSync(join(repo, 'no-such-target.ts'), join(repo, 'x.ts'))
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const result = spawnSync('node', [guard], { cwd: repo, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /tracked but unreadable \(ENOENT\) — no limit can be applied/)
    assert.doesNotMatch(result.stderr, /lines — unreadable limit is/)
    assert.match(result.stderr, /unreadable tracked path cannot be graded at all/)
    assert.doesNotMatch(result.stderr, /Split the file/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('an unreadable path blocks the commit only when it is among the staged arguments', () => {
  // The unreadable branch shares the SAME scoped/all filter as a normal violation — this
  // pins that no shortcut in the catch-block bypasses staged-mode scoping for it.
  // MUTATION: evaluate the unreadable branch against `all` instead of `scoped` → a
  // dangling symlink anywhere in the tree blocks every commit, even one that never
  // touched it.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-staged-unreadable-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({ rules: [], excludeBasenamePatterns: [], excludeGlobs: [], baseline: {} }),
    )
    symlinkSync(join(repo, 'no-such-target.ts'), join(repo, 'x.ts'))
    writeFileSync(join(repo, 'b.ts'), 'compliant\n')
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const run = (args) => spawnSync('node', [guard, ...args], { cwd: repo, encoding: 'utf8' })

    assert.equal(run([]).status, 1, 'whole-tree mode sees the dangling symlink and fails')
    assert.equal(run(['b.ts']).status, 0, 'x.ts was not staged, so it cannot block')
    assert.equal(run(['x.ts']).status, 1, 'x.ts WAS staged, so it blocks')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// ------------------------------------------- the .coderabbit.yaml pinned mirror

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

// ------------------------------------------------------------ flags and modes

test('passing two mode flags together blocks instead of silently running one', () => {
  // MUTATION: remove the `new Set(flags).size > 1` guard → red. Both flags are KNOWN, so
  // neither the unknown-flag gate nor the flag-vs-path gate catches the pair; the first `if`
  // then wins and the other request is dropped with no diagnostic and exit 0. On the escape
  // valve that reads as "the baseline was rewritten" when nothing was written — the same
  // looks-like-it-worked shape as the `--stats` positional collision, one level up.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  for (const pair of [
    ['--update-baseline', '--stats'],
    ['--stats', '--update-baseline'],
  ]) {
    const r = spawnSync('node', [guard, ...pair], { encoding: 'utf8' })
    assert.equal(r.status, 1, `${pair.join(' ')} must block`)
    assert.match(r.stderr, /separate modes — run one/)
  }
  // each alone still works
  assert.equal(spawnSync('node', [guard, '--stats'], { encoding: 'utf8' }).status, 0)
})

test('a violation blocks however its path is spelled, and an unknown path is rejected', () => {
  // MUTATION: drop the normalisation and the unknown-argument check → red. `files.includes()` is
  // an exact string compare, so `./x.ts` and an absolute path matched nothing and the guard
  // returned 0 on a REAL violation. Today's only caller passes repo-root-relative paths, so this
  // held by luck of the caller — the same shape as the flag/path collision.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-norm-'))
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
        rules: [{ kind: 'utility/helper', glob: '**/*.ts', max: 100 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'src/big.ts'), 'x\n'.repeat(150))
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const run = (arg) =>
      spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', arg], {
        cwd: repo,
        encoding: 'utf8',
      })
    for (const spelling of ['src/big.ts', './src/big.ts', join(repo, 'src/big.ts')]) {
      const r = run(spelling)
      assert.equal(r.status, 1, `${spelling} must block`)
      // Assert the REASON, not just the exit code. Dropping normalisation still exits 1 — via
      // the unknown-path branch — so an outcome-only assertion passed with the mechanism gone.
      // A legitimate absolute-path caller must be told about the VIOLATION, not handed a
      // spurious "matches no tracked path".
      assert.match(
        r.stderr,
        /violation\(s\) of the limits/,
        `${spelling} must report the violation`,
      )
      assert.doesNotMatch(
        r.stderr,
        /match no tracked path/,
        `${spelling} must resolve, not be rejected`,
      )
    }
    const bogus = run('nope/missing.ts')
    assert.equal(bogus.status, 1, 'an argument matching no tracked path must fail closed')
    assert.match(bogus.stderr, /match no tracked path/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('a staged deletion is not rejected as an unknown path', () => {
  // MUTATION: drop the `deleted` set from the unknown-path filter → red. lefthook passes staged
  // DELETIONS through {staged_files} while `git ls-files` omits them, so the unknown-path check
  // introduced one commit earlier blocked EVERY commit that removes a file. Caught by CR-local
  // round 4; the regression was live for one commit.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-del-'))
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
        rules: [{ kind: 'utility/helper', glob: '**/*.ts', max: 100 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'src/gone.ts'), 'x\n'.repeat(10))
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'seed', '--no-verify'], { cwd: repo })
    execFileSync('git', ['rm', '-q', 'src/gone.ts'], { cwd: repo })

    const del = spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', 'src/gone.ts'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.equal(del.status, 0, 'a staged deletion must not block the commit')

    // a genuinely unknown path must still fail closed
    const bogus = spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', 'src/never.ts'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.equal(bogus.status, 1)
    assert.match(bogus.stderr, /match no tracked path/)
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
