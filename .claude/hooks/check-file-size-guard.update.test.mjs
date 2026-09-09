// Tests for `--update-baseline`, the file-size guard's escape valve. Run:
//   node --test .claude/hooks/check-file-size-guard.update.test.mjs
//
// A THIRD file, split from the unit suite when it reached the 500-line test cap this very
// guard enforces — twice in one session. Grandfathering a file written minutes earlier is the
// "widen the rule to fit my own code" move the programme exists to stop, and trimming a comment
// to squeak under is the same move in costume. The split is by concern: in-process unit tests,
// subprocess enforcement tests, and this — the one code path that WRITES to the data file the
// guard is judged against, which is why it is worth isolating.
//
// Every case is MUTATION-PINNED: break the named mechanism and exactly one test goes red.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// ------------------------------------------------- --update-baseline (CLI-only, see header)

const GUARD_PATH = '.claude/hooks/check-file-size-guard.mjs'
const utilLimits = (baseline, excludeGlobs = []) => ({
  rules: [{ kind: 'util', glob: '**/*.ts', max: 100 }],
  excludeBasenamePatterns: [],
  excludeGlobs,
  baseline,
})

/** A throwaway git repo with a copy of the guard, given `limits` and a map of path -> writer. */
function makeUpdateRepo(limits, files) {
  const repo = mkdtempSync(join(tmpdir(), 'file-size-upd-'))
  execFileSync('git', ['init', '-q', '.'], { cwd: repo })
  mkdirSync(join(repo, '.claude', 'hooks'), { recursive: true })
  copyFileSync(join(process.cwd(), GUARD_PATH), join(repo, GUARD_PATH))
  // 4-space indent DELIBERATELY: no code path produces it (a real write is 2-space + newline),
  // so the no-op test's byte-comparison catches a rewrite in EITHER format. A compact fixture
  // made a compact-writing mutation byte-identical by accident, and it survived.
  writeFileSync(join(repo, '.claude/limits.json'), JSON.stringify(limits, null, 4))
  for (const [path, write] of Object.entries(files)) {
    mkdirSync(join(repo, path, '..'), { recursive: true })
    write(join(repo, path))
  }
  execFileSync('git', ['add', '-A'], { cwd: repo })
  return repo
}
const runUpdateBaseline = (repo) =>
  spawnSync('node', [GUARD_PATH, '--update-baseline'], { cwd: repo, encoding: 'utf8' })

test("update-baseline keeps an unreadable path's existing row instead of dropping it", () => {
  // The anti-laundering guarantee. MUTATION: drop the `if (previous[file] !== undefined)` keep
  // in updateBaseline's catch (bare `continue`) → the row vanishes from the rewritten baseline
  // instead of surviving unreadable — laundering a violation out by making its file unreadable.
  const repo = makeUpdateRepo(utilLimits({ 'src/gone.ts': 150 }), {
    'src/gone.ts': (p) => symlinkSync(join(p, '..', 'no-such-target.ts'), p),
  })
  try {
    assert.equal(runUpdateBaseline(repo).status, 0)
    const after = JSON.parse(readFileSync(join(repo, '.claude/limits.json'), 'utf8'))
    assert.equal(after.baseline['src/gone.ts'], 150)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('update-baseline leaves limits.json byte-identical when it already matches the tree', () => {
  // MUTATION: drop the `added/removed/changed all empty -> return 0` early exit → the function
  // falls through to writeFileSync unconditionally, reformatting the file on every run (2-space
  // indent + trailing newline) even though nothing logically changed.
  const repo = makeUpdateRepo(utilLimits({ 'src/big.ts': 150 }), {
    'src/big.ts': (p) => writeFileSync(p, 'x\n'.repeat(150)),
  })
  const raw = readFileSync(join(repo, '.claude/limits.json'), 'utf8')
  try {
    const upd = runUpdateBaseline(repo)
    assert.equal(upd.status, 0)
    assert.match(upd.stderr, /already matches the tree/)
    assert.equal(readFileSync(join(repo, '.claude/limits.json'), 'utf8'), raw)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('update-baseline reports an added violation and a removed now-compliant entry, and drops the removed key', () => {
  // MUTATION: swap which side of `previous`/`next` the added/removed filters read → a shrunk-
  // to-compliant file stops being dropped, or a new violation gets silently absorbed as if it
  // always belonged.
  const limits = utilLimits({ 'src/old.ts': 150 }, ['scripts/**'])
  const repo = makeUpdateRepo(limits, {
    'src/old.ts': (p) => writeFileSync(p, 'x\n'.repeat(40)), // now compliant -> removed
    'src/new.ts': (p) => writeFileSync(p, 'x\n'.repeat(120)), // not baselined -> added
  })
  try {
    const upd = runUpdateBaseline(repo)
    assert.equal(upd.status, 0)
    assert.match(upd.stderr, /- src\/old\.ts \(was 150\) — no longer a violation/)
    assert.match(upd.stderr, /\+ src\/new\.ts: 120 — NEW violation, argue for it in the PR/)
    const after = JSON.parse(readFileSync(join(repo, '.claude/limits.json'), 'utf8'))
    assert.deepEqual(after.baseline, { 'src/new.ts': 120 })
    assert.deepEqual(after.rules, limits.rules)
    assert.deepEqual(after.excludeGlobs, limits.excludeGlobs)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
