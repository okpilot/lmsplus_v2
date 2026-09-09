// CLI + live-tree tests for the file-size guard. Split out of the unit suite when the
// combined file crossed the 500-line test-file cap that this very guard enforces —
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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const LIMITS = JSON.parse(readFileSync('.claude/limits.json', 'utf8'))

/** A minimal limits object so unit cases do not depend on the live baseline. */
const _fixture = (over = {}) => ({
  rules: [
    { kind: 'test file', glob: '**/*.test.*', max: 500 },
    { kind: 'SQL migration', glob: 'supabase/migrations/**/*.sql', max: 300 },
    { kind: 'page file', glob: '**/page.tsx', max: 80 },
    { kind: 'hook', glob: '**/use-*.ts', max: 80 },
    { kind: 'Server Action file', glob: '**/*.ts', max: 100, requiresUseServer: true },
    { kind: 'React component', glob: '**/*.tsx', max: 150 },
    { kind: 'utility/helper', glob: '**/*.ts', max: 200 },
  ],
  excludeBasenamePatterns: ['\\.config\\.[jt]sx?$'],
  excludeGlobs: ['scripts/**', 'packages/db/src/types.ts'],
  baseline: {},
  ...over,
})

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

test('reports a single stale baseline entry in the singular, several in the plural', () => {
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
    assert.equal(result.status, 0)
    assert.match(result.stderr, /1 stale baseline entry in/)
    assert.doesNotMatch(result.stderr, /1 stale baseline entries/)
  } finally {
    rmSync(one, { recursive: true, force: true })
  }

  const two = makeRepo({ 'gone.ts': 90, 'also-gone.ts': 90 })
  try {
    const result = spawnSync('node', [guard], { cwd: two, encoding: 'utf8' })
    assert.equal(result.status, 0)
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

// ------------------------------------------- the .coderabbit.yaml pinned mirror

test('.coderabbit.yaml carries the same limits as limits.json', () => {
  // CodeRabbit cannot follow a pointer — `agent-workflow.md § Rule-Mirror Sync` says so
  // explicitly — so its copy of the numbers is KEPT and verified here rather than
  // deleted. This is the second codification move: PIN a copy the consumer cannot
  // dereference, instead of DELETING it. Without this test the two drift, which is
  // exactly what happened to the eight prose copies this slice replaced.
  const yaml = readFileSync('.coderabbit.yaml', 'utf8')
  const inYaml = new Set([...yaml.matchAll(/Max (\d+) lines/g)].map((m) => Number(m[1])))
  const inJson = new Set(LIMITS.rules.map((r) => r.max))

  for (const n of inJson) {
    assert.ok(inYaml.has(n), `limits.json declares ${n} but .coderabbit.yaml never states it`)
  }
  for (const n of inYaml) {
    assert.ok(inJson.has(n), `.coderabbit.yaml states ${n}, which is not a limit in limits.json`)
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
