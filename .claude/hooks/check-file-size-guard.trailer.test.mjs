// stderr-trailer tests for the file-size guard. Split out of the CLI suite when linking every
// claim to its mutation pushed the combined file past the test-file cap that this very guard
// enforces. Run:
//   node --test .claude/hooks/check-file-size-guard.trailer.test.mjs
//
// Every case below is MUTATION-PINNED: break the named mechanism in
// check-file-size-guard.mjs and the GROUP named above the case goes red.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const lines = (n) => `${'x\n'.repeat(n)}`

// ------------------------------------------------- the two-branch stderr trailer

// GROUP: cli-split-guidance-predicate-inverted
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

// GROUP: cli-unreadable-guidance-predicate-inverted
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

// GROUP: cli-unreadable-escapes-staged-scope
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
