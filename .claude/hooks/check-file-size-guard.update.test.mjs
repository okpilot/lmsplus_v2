// Tests for the file-size guard's NON-ENFORCEMENT surfaces — the mode flags (`--stats`,
// `--update-baseline`) and the `.coderabbit.yaml` mirror pin. Run:
//   node --test .claude/hooks/check-file-size-guard.update.test.mjs
//
// A THIRD file, split from the unit suite when it reached the test-file cap this very
// guard enforces — twice in one session. Grandfathering a file written minutes earlier is the
// "widen the rule to fit my own code" move the programme exists to stop, and trimming a comment
// to squeak under is the same move in costume. The split is by concern: in-process unit tests,
// subprocess enforcement tests, and this — the one code path that WRITES to the data file the
// guard is judged against, which is why it is worth isolating. The `--stats` cases moved here
// from the CLI suite when that file came within a few lines of its cap: that little headroom
// is a trap for whoever adds the next test, and this file is where the non-enforcing modes
// belong anyway.
//
// Every case is MUTATION-PINNED: break the named mechanism and that case — or the named GROUP of cases sharing that mechanism — goes red.
// Not "exactly one": several mechanisms here are pinned by a PAIR, and the stricter wording
// was false of this file. Do not restore it without re-running the mutations.
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

const LIMITS = JSON.parse(readFileSync('.claude/limits.json', 'utf8'))

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

test('update-baseline drops an unreadable file that was never baselined, instead of inventing a row', () => {
  // MUTATION: change `if (previous[file] !== undefined) next[file] = previous[file]` to an
  // unconditional assignment (e.g. `next[file] = previous[file] ?? 0`) → an unreadable file
  // that was never a recorded violation gets WRITTEN into the baseline anyway, with a
  // fabricated allowance the code never measured — the anti-laundering guarantee's mirror
  // image: it must not INVENT a row any more than it may DROP an existing one.
  const repo = makeUpdateRepo(utilLimits({}), {
    'src/gone.ts': (p) => symlinkSync(join(p, '..', 'no-such-target.ts'), p),
  })
  try {
    assert.equal(runUpdateBaseline(repo).status, 0)
    const after = JSON.parse(readFileSync(join(repo, '.claude/limits.json'), 'utf8'))
    assert.equal('src/gone.ts' in after.baseline, false)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('reports per-rule compliance totals when asked for stats', () => {
  // MUTATION: delete the `--stats` early return in main() → this goes red. The flag replaced a
  // derivation command embedded in .claude/limits.json that carried an unbound placeholder and
  // THREW when run as written — it looked checkable and was not, which is worse than the literal
  // ratio it replaced. A flag cannot rot that way: the same code that enforces computes it.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const out = execFileSync('node', [guard, '--stats'], { encoding: 'utf8' })
  assert.match(out, /Server Action file \(cap 100\): \d+\/\d+ comply/)
  assert.match(out, /test file \(cap 500\): \d+\/\d+ comply/)
  // and it must not double as an enforcement run
  assert.doesNotMatch(out, /violation/)
})

test('stats mode skips an unreadable tracked file instead of blocking the whole report', () => {
  // MUTATION: drop the `catch { continue }` inside stats() → a single dangling symlink
  // anywhere in the tree turns this purely informational report into a hard block, unlike
  // every other unreadable-path scenario, which is a real regression: --stats has no
  // "fix the split" story for an unreadable path the way enforcement mode does.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const repo = mkdtempSync(join(tmpdir(), 'file-size-stats-unreadable-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'limits.json'),
      JSON.stringify({
        rules: [{ kind: 'util', glob: '**/*.ts', max: 100 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'a.ts'), 'x\n')
    symlinkSync(join(repo, 'no-such-target.ts'), join(repo, 'b.ts'))
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const result = spawnSync('node', [guard, '--stats'], { cwd: repo, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /util \(cap 100\): 1\/1 comply/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('a mode flag mixed with file paths blocks instead of skipping enforcement', () => {
  // MUTATION: restore `args.includes('--stats')` → red. That was a positional-arg collision,
  // not a mode switch: a file literally named `--stats` anywhere in argv turned a run carrying
  // a real violation into exit 0. Unreachable through today's two callers (lefthook's glob
  // drops an extensionless name; CI passes none) — but by luck of the callers, not by
  // construction, and it is the same green-while-broken shape as the four criticals this slice
  // closed.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const mixed = spawnSync('node', [guard, '--stats', 'CLAUDE.md'], { encoding: 'utf8' })
  assert.equal(mixed.status, 1)
  assert.match(mixed.stderr, /cannot be combined with file paths/)
})

test('an unrecognised flag blocks rather than being treated as a file path', () => {
  // MUTATION: drop the KNOWN_FLAGS check → an unknown flag falls through to the file list and
  // is silently ignored, so a typo'd `--upate-baseline` would run a plain enforcement pass and
  // look like it worked.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  const bogus = spawnSync('node', [guard, '--bogus'], { encoding: 'utf8' })
  assert.equal(bogus.status, 1)
  assert.match(bogus.stderr, /unknown flag/)
})

test('updating the baseline rewrites a shrunk entry and leaves everything else alone', () => {
  // The escape valve for the exact-match ratchet: without it, every legitimate shrink fails CI
  // until a human edits JSON by hand, and a check that annoying gets switched off. It must be
  // opt-in — a check that rewrites its own baseline silently launders the record it is judged
  // against. MUTATION: make updateBaseline write on a normal run → red.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-update-'))
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
    const limits = {
      rules: [{ kind: 'utility/helper', glob: '**/*.ts', max: 100 }],
      excludeBasenamePatterns: [],
      excludeGlobs: [],
      baseline: { 'src/big.ts': 200 },
    }
    writeFileSync(join(repo, '.claude/limits.json'), JSON.stringify(limits))
    writeFileSync(join(repo, 'src/big.ts'), 'x\n'.repeat(150)) // shrunk from 200
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const before = spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.equal(before.status, 1, 'a shrunk grandfathered file must block until recorded')

    const upd = spawnSync(
      'node',
      ['.claude/hooks/check-file-size-guard.mjs', '--update-baseline'],
      { cwd: repo, encoding: 'utf8' },
    )
    assert.equal(upd.status, 0)
    assert.match(upd.stderr, /src\/big\.ts: 200 -> 150/)

    const after = JSON.parse(readFileSync(join(repo, '.claude/limits.json'), 'utf8'))
    assert.equal(after.baseline['src/big.ts'], 150)
    assert.deepEqual(after.rules, limits.rules, 'nothing but the baseline may be rewritten')
    assert.equal(
      spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs'], {
        cwd: repo,
        encoding: 'utf8',
      }).status,
      0,
    )
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('the lefthook glob reaches every extension the rules can match', () => {
  // MUTATION: drop `sql` (or `mjs`) from the file-size-guard glob in lefthook.yml → red.
  // Nothing else pins this. The guard can only grade a file lefthook actually HANDS it, so a
  // narrowed glob silently retires whole rule classes at pre-commit while every unit test stays
  // green — CI's whole-tree run would still catch it, but a commit sails through locally. This is
  // not hypothetical: the `mjs` omission meant the guard never ran at pre-commit on its OWN files
  // for the entire slice that introduced it, which lefthook.yml's comment now records.
  const yml = readFileSync('lefthook.yml', 'utf8')
  const block = yml.slice(yml.indexOf('file-size-guard:'))
  const glob = block.match(/glob:\s*"([^"]+)"/)
  assert.ok(glob, 'file-size-guard has no glob in lefthook.yml')
  const exts = new Set(glob[1].replace(/^\*\.\{|\}$/g, '').split(','))
  // Derive what the rules can match rather than restating a list: every extension any rule glob
  // ends in must be reachable. `**/*.test.*` is a basename rule with an open extension, and .mjs
  // is the one it caught us on, so it is asserted explicitly.
  for (const want of ['ts', 'tsx', 'sql', 'mjs']) {
    assert.ok(exts.has(want), `lefthook file-size-guard glob omits ${want}: ${glob[1]}`)
  }
})

test('.coderabbit.yaml pins each cap to the same RULE KIND as limits.json', () => {
  // CodeRabbit cannot follow a pointer — `agent-workflow.md § Rule-Mirror Sync` says so — so its
  // copy of the numbers is KEPT and verified here rather than deleted. This is the second
  // codification move: PIN a copy the consumer cannot dereference, instead of DELETING it.
  //
  // MUTATION: compare the two as SETS of numbers instead of per-kind pairs → red. The set form
  // was the original and it was VACUOUS for the mutation that matters: swapping the page cap
  // with the component cap leaves both sets identical, so the mirror could state the two kinds
  // reversed and the test still passed. Proven by executing that swap.
  const yaml = readFileSync('.coderabbit.yaml', 'utf8').split('\n')

  // Each .coderabbit.yaml path block, and the limits.json rule KIND it mirrors. The YAML paths
  // are deliberately narrower than limits.json's globs (CodeRabbit reviews app-layer code, not
  // every file on disk) — so the mapping is stated, not inferred from the glob text.
  const MIRRORED = [
    ['apps/web/app/**/page.tsx', 'page file'],
    ['apps/web/app/**/_components/*.tsx', 'React component'],
    ['apps/web/app/**/actions.ts', 'Server Action file'],
    ['apps/web/app/**/_hooks/use-*.ts', 'hook'],
    ['packages/db/src/**/*.ts', 'utility/helper'],
    ['supabase/migrations/**/*.sql', 'SQL migration'],
    ['**/*.test.{ts,tsx}', 'test file'],
  ]

  /** The `Max N lines` stated inside one `- path:` block, or null. */
  const capFor = (path) => {
    const i = yaml.findIndex((l) => l.trim() === `- path: "${path}"`)
    assert.notEqual(i, -1, `.coderabbit.yaml has no block for ${path}`)
    for (let j = i + 1; j < yaml.length && !/^\s*- path: "/.test(yaml[j]); j++) {
      const m = yaml[j].match(/Max (\d+) lines/)
      if (m) return Number(m[1])
    }
    return null
  }

  for (const [path, kind] of MIRRORED) {
    // EVERY rule of the kind, not `.find()`. limits.json declares `test file`, `hook` and
    // `Server Action file` TWICE each (one rule per glob), so a `.find()` pinned only the first
    // and a cap changed on the second diverged from .coderabbit.yaml in silence — while this
    // test, which agent-coderabbit-sync.md tells the agent to trust instead of hand-checking,
    // stayed green. Found by CR-local round 2.
    const rules = LIMITS.rules.filter((r) => r.kind === kind)
    assert.ok(rules.length > 0, `limits.json has no rule of kind ${kind}`)
    const maxes = new Set(rules.map((r) => r.max))
    assert.equal(maxes.size, 1, `limits.json declares ${kind} with disagreeing caps`)
    assert.equal(capFor(path), rules[0].max, `${path} must mirror the ${kind} cap`)
  }

  // and no cap in the YAML that limits.json does not declare at all
  const declared = new Set(LIMITS.rules.map((r) => r.max))
  for (const l of yaml) {
    const m = l.match(/Max (\d+) lines/)
    if (m) assert.ok(declared.has(Number(m[1])), `.coderabbit.yaml states ${m[1]}, not a limit`)
  }
})
