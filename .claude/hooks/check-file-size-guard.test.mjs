// Unit tests for the file-size guard — in-process only, no subprocess, no real tree. The CLI and
// mode-flag paths live in sibling SUBPROCESS suites, because `main()` and its local helpers are
// not exported; `*.directive` is a sibling too but in-process, split off this file on size. So
// `ls .claude/hooks/check-file-size-guard*.test.mjs` enumerates the SUITES, not the subprocess
// ones — read each header for which kind it is. Note the glob has no dot before the `*`: the
// dotted form needs a segment between the dots and silently omits this very file.
// Run:
//   node --test .claude/hooks/check-file-size-guard.test.mjs
//
// Every case below is MUTATION-PINNED: break the named mechanism in
// check-file-size-guard.mjs (or .claude/limits.json) and that case — or the named GROUP of cases sharing that mechanism — goes red.
// Not "exactly one": several mechanisms here are pinned by a PAIR, and the stricter wording
// was false of this file. Do not restore it without re-running the mutations.
// The mutation each case pins is named in its title, because a test whose mechanism
// nothing exercises is a lie you will later trust.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  classify,
  countLines,
  evaluate,
  globToRe,
  isExcluded,
  staleBaselineEntries,
} from './check-file-size-guard.mjs'

const LIMITS = JSON.parse(readFileSync('.claude/limits.json', 'utf8'))

/** A minimal limits object so unit cases do not depend on the live baseline. */
const fixture = (over = {}) => ({
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

// ---------------------------------------------------------------- countLines

// GROUP: countlines-returns-raw-part-count
test('counts a newline-terminated file the way wc -l does', () => {
  // MUTATION: return parts.length unconditionally → 101 here, and the real
  // batch-submit.ts (which sits exactly at its cap) starts failing.
  assert.equal(countLines('a\nb\nc\n'), 3)
  assert.equal(countLines(lines(100)), 100)
})

// GROUP: countlines-always-subtracts-one
test('counts the final partial line when a file lacks a trailing newline', () => {
  // MUTATION: drop the endsWith('\n') branch → 2, silently losing the last line of
  // any file the formatter has not touched.
  assert.equal(countLines('a\nb\nc'), 3)
})

test('counts an empty file as zero lines, not one', () => {
  assert.equal(countLines(''), 0)
})

test('a file exactly at its limit is not a violation', () => {
  // The boundary that made counting semantics load-bearing. batch-submit.ts is real.
  const limits = fixture()
  const files = ['a/batch-submit.ts']
  const read = () => `'use server'\n${lines(99)}`
  const { regressions } = evaluate(files, read, limits)
  assert.equal(countLines(read()), 100)
  assert.deepEqual(regressions, [])
})

// ------------------------------------------------------------------ exclusion

test('test files are relaxed to 500, not exempt from every limit', () => {
  // MUTATION: restore the blanket basename EXCLUSION → a test file gets no cap at all,
  // silently retiring a promoted rule that the great majority of files still comply with.
  const limits = fixture()
  assert.equal(isExcluded('apps/web/a/foo.test.ts', limits), false)
  const r = classify('apps/web/a/foo.test.ts', '', limits)
  assert.equal(r.kind, 'test file')
  assert.equal(r.max, 500)
  // and the test cap wins over the util/component cap it would otherwise take
  assert.equal(classify('apps/web/a/foo.test.tsx', '', limits).max, 500)
})

test('excludes the generated Supabase types file', () => {
  // MUTATION: remove the types.ts glob → a 1806-line GENERATED file is reported as a
  // violation nobody can fix, since the generator owns its length.
  assert.equal(isExcluded('packages/db/src/types.ts', fixture()), true)
})

test('excludes the scripts directory', () => {
  // MUTATION: remove 'scripts/**' → ~10 seed/import scripts flood the report. This was
  // the single largest source of false positives in the naive first measurement (74
  // violations, vs 37 real).
  assert.equal(isExcluded('scripts/foo.ts', fixture()), true)
})

test('the live limits file excludes the frozen packages/db/migrations tree', () => {
  // Not a fixture case — pins the REAL config. packages/db/migrations has been frozen
  // since 2026-07-11 and carries false history; 13 of its files exceed 300 lines and
  // must never be graded, baselined or "fixed".
  assert.equal(isExcluded('packages/db/migrations/0001_x.sql', LIMITS), true)
  assert.equal(isExcluded('supabase/migrations/0001_x.sql', LIMITS), false)
})

test('the live limits file excludes both script directories and generated types', () => {
  // Added after mutation testing: deleting 'scripts/**' from limits.json left the whole
  // suite GREEN, because the exclusion cases above assert against a fixture and so pin
  // the mechanism without pinning the config. A fixture-only test cannot catch a config
  // regression — that is the gap this closes.
  assert.equal(isExcluded('scripts/foo.ts', LIMITS), true)
  assert.equal(isExcluded('apps/web/scripts/import-questions.ts', LIMITS), true)
  // e2e helpers are deliberately NOT excluded — only *.test.*/*.spec.* BASENAMES are.
  // The over-limit ones are grandfathered in `baseline`, visibly, rather than hidden
  // behind a directory exclusion that would reverse a documented decision.
  assert.equal(isExcluded('apps/web/e2e/helpers/supabase.ts', LIMITS), false)
  assert.equal(classify('apps/web/e2e/quiz.spec.ts', '', LIMITS).max, 500)
  assert.equal(isExcluded('packages/db/src/types.ts', LIMITS), true)
  // Config files: currently no config file is over any cap, so dropping this exclusion
  // breaks nothing visible and survived mutation testing until this line was added.
  assert.equal(isExcluded('apps/web/next.config.ts', LIMITS), true)
  assert.equal(isExcluded('apps/web/vitest.config.ts', LIMITS), true)
  assert.equal(isExcluded('apps/web/lib/queries/x.ts', LIMITS), false)
})

test('every rule note pointing at `_ratios` finds it — the pointer cannot dangle', () => {
  // MUTATION: delete (or rename) the top-level `_ratios` key while a rule's `note` still
  // reads "See `_ratios`." — nothing else in this codebase reads `note`, so a dropped
  // key would leave the pointer dangling silently forever.
  // Deliberately narrow: this pins only the dangling-pointer half. It does NOT detect a
  // future note re-duplicating the `_ratios` paragraph text instead of pointing at it —
  // that would need a text-similarity check across hand-written prose, which is the same
  // fragile-mirror trade this PR already declined for `globToRe` memoization. `note` is
  // pure documentation the guard never evaluates, so a re-duplicated paragraph is a style
  // regression, not a functional one; a dangling pointer is what's cheap and unambiguous
  // to pin here.
  const referencing = LIMITS.rules.filter((r) => r.note?.includes('`_ratios`'))
  assert.ok(referencing.length > 0, 'expected at least one rule note to reference `_ratios`')
  assert.equal(typeof LIMITS._ratios, 'string')
  assert.ok(LIMITS._ratios.length > 0)
})

test('the live limits file orders the Server Action rule ahead of the util rule', () => {
  // Also added after mutation testing: moving the util rule to the front of
  // limits.json.rules silently loosened the Server Action cap to the utility one with every
  // test still green, for the same fixture-vs-config reason. Rule ORDER is load-bearing
  // — first match wins — so it has to be pinned against the real file.
  const action = classify('apps/web/app/a/actions/x.ts', "'use server'\nconst a = 1\n", LIMITS)
  assert.equal(action.kind, 'Server Action file')
  assert.equal(action.max, 100)

  const util = classify('apps/web/app/a/actions/x-helpers.ts', 'const a = 1\n', LIMITS)
  assert.equal(util.kind, 'utility/helper')
  assert.equal(util.max, 200)

  const page = classify('apps/web/app/dash/page.tsx', 'export default function P() {}\n', LIMITS)
  assert.equal(page.max, 80)
})

// ------------------------------------------------------------------- classify

test('a .ts declaring use server takes the 100 limit, not the 200 util limit', () => {
  // MUTATION: move the util rule above the Server Action rule in limits.json → a real
  // Server Action is graded against the utility rule and its cap silently loosens.
  const r = classify('apps/web/app/a/actions/x.ts', "'use server'\n", fixture())
  assert.equal(r.kind, 'Server Action file')
  assert.equal(r.max, 100)
})

test('a .ts inside actions/ WITHOUT the directive takes the util limit', () => {
  // The folder-based reading of "Server Action file" is wrong: measured, 2 of 7
  // over-limit files under actions/ are pure helpers, not actions.
  const r = classify('apps/web/app/a/actions/x-helpers.ts', 'export const f = 1\n', fixture())
  assert.equal(r.kind, 'utility/helper')
  assert.equal(r.max, 200)
})

test('classifies a SQL migration, so the sql path is not invisible to the guard', () => {
  // MUTATION: widen this rule's glob past `supabase/migrations/**/*.sql`, or reorder it after a
  // broader rule → a migration stops taking the migration cap. FIXTURE-LEVEL ONLY: this case
  // calls classify() against the local fixture, so it can say nothing about the live config or
  // the lefthook glob. It previously claimed to pin 'drop sql from the lefthook glob', which it
  // cannot detect at all — the exact lie this file's header warns about. The glob is pinned
  // separately, in the --update-baseline suite.
  const r = classify('supabase/migrations/20260101000000_x.sql', '', fixture())
  assert.equal(r.kind, 'SQL migration')
  assert.equal(r.max, 300)
})

test('page.tsx takes the 80 limit ahead of the 150 component limit', () => {
  const r = classify('apps/web/app/dash/page.tsx', 'export default function P() {}\n', fixture())
  assert.equal(r.max, 80)
})

// GROUP: globtore-drops-case-insensitive-flag
test('an uppercase extension is still matched, not silently unclassified', () => {
  // MUTATION: drop the 'i' flag from globToRe → an over-limit `Weird.TSX` matches NO rule
  // and passes clean. Found by implementation-critic as a 17th surviving mutation.
  const r = classify('apps/web/components/ui/Weird.TSX', '', fixture())
  assert.notEqual(r, null)
  assert.equal(r.max, 150)
})

// GROUP: classify-defaults-instead-of-returning-null
test('a file type with no matching rule is left unclassified, not defaulted to a limit', () => {
  // MUTATION: fall through to a default rule instead of returning null when no glob
  // matches → an untracked file type (docs, configs with no glob at all) silently
  // starts being graded against a made-up limit instead of being ignored.
  assert.equal(classify('README.md', 'x'.repeat(10000), fixture()), null)
  assert.equal(classify('docs/plan.md', 'x'.repeat(10000), fixture()), null)
})

test('glob translation distinguishes one segment from any depth', () => {
  assert.equal(globToRe('**/use-*.ts').test('a/b/use-x.ts'), true)
  assert.equal(globToRe('**/use-*.ts').test('use-x.ts'), true)
  assert.equal(globToRe('**/use-*.ts').test('a/use-x/y.ts'), false)
  assert.equal(globToRe('scripts/**').test('scripts/a/b.ts'), true)
  assert.equal(globToRe('scripts/**').test('apps/scripts/a.ts'), false)
})

// GROUP: globtore-stops-escaping-metacharacters
test('treats regex metacharacters inside a glob as literal characters', () => {
  // MUTATION: stop escaping SPECIAL characters (emit `c` instead of `\\${c}`) → a glob
  // like '**/*.test.*' would compile with its literal dots acting as regex wildcards
  // ("any character"), silently widening every rule's match beyond its intended glob.
  const dot = globToRe('a.b.c')
  assert.equal(dot.test('a.b.c'), true)
  assert.equal(dot.test('aXbXc'), false) // unescaped '.' would match any char here
  const question = globToRe('ab?c')
  assert.equal(question.test('ab?c'), true)
  assert.equal(question.test('ac'), false) // unescaped '?' would make the 'b' optional
})

// -------------------------------------------------------------- ratchet logic

// GROUP: unreadable-path-skipped-instead-of-reported
test('an enumerated file that cannot be read blocks instead of being skipped', () => {
  // MUTATION: restore `continue` in evaluate's catch → red. SUPERSEDES the old
  // "skip a mid-run deletion" behaviour, which was measured to hide NINE baselined
  // violators when one parent directory lost its execute bit: read and lstat fail
  // identically there, so "gone" and "unreadable" were indistinguishable. Every path
  // here comes from `git ls-files`, so git already asserts it exists — failing closed
  // on a genuine race is the correct direction to be wrong.
  const limits = fixture()
  const boom = () => {
    throw Object.assign(new Error('nope'), { code: 'EACCES' })
  }
  const { regressions } = evaluate(['a/x.ts'], boom, limits)
  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].kind, 'unreadable')
})

test('flags a new over-limit file that is not in the baseline', () => {
  const { regressions } = evaluate(['a/use-x.ts'], () => lines(81), fixture())
  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].why, 'new violation')
})

// GROUP: ratchet-fails-at-exact-recorded-size
test('a grandfathered file at its recorded size does not fail', () => {
  // MUTATION: `n !== allowed` → `n >= allowed` → a file sitting exactly at its recorded
  // size fails, and the ratchet is a gate again, blocking all work. Supersets the shrink
  // test below, which the same edit also reddens.
  const limits = fixture({ baseline: { 'a/use-x.ts': 81 } })
  const { regressions } = evaluate(['a/use-x.ts'], () => lines(81), limits)
  assert.deepEqual(regressions, [])
})

// GROUP: baseline-lookup-reads-rule-max
test('a grandfathered file that GREW by one line fails', () => {
  // MUTATION: `const allowed = baseline[file]` → `const allowed = rule.max` → a 239-line
  // file can grow to 299 unnoticed. This is the whole point of a ratchet. Mutating the
  // COMPARISON to `n > rule.max` instead leaves this test green — 82 > 80 still fires and
  // the message still reads "grew past its grandfathered size of 81".
  const limits = fixture({ baseline: { 'a/use-x.ts': 81 } })
  const { regressions } = evaluate(['a/use-x.ts'], () => lines(82), limits)
  assert.equal(regressions.length, 1)
  assert.match(regressions[0].why, /grew past its grandfathered size of 81/)
})

// GROUP: new-violation-never-reported
test('an over-limit file with no baseline row is reported as a new violation', () => {
  // MUTATION: drop the `regressions.push` from the `allowed === undefined` branch, keeping
  // its `continue` → the file is skipped instead of reported. Nothing here is grandfathered:
  // `fixture()` already ships `baseline: {}`, so the override is a no-op and `baseline[file]`
  // is undefined. That early return fires BEFORE `liveViolators.add` and the `n !== allowed`
  // comparison, so no mutation of the baseline comparison can reach this test.
  const limits = fixture({ baseline: {} })
  const { regressions } = evaluate(['a/use-x.ts'], () => lines(81), limits)
  assert.equal(regressions.length, 1)
})

// GROUP: stale-baseline-rows-never-reported
test('a baseline row whose file was deleted is reported stale', () => {
  // MUTATION: skip stale reporting → a baselined path is deleted, an unrelated new file
  // later occupies the SAME path at a smaller-but-still-over size, and it inherits the
  // old allowance silently. Path reuse, not renaming, is the hole here.
  const limits = fixture({ baseline: { 'gone/use-x.ts': 120 } })
  const { liveViolators } = evaluate([], () => '', limits)
  assert.deepEqual(staleBaselineEntries(liveViolators, limits), ['gone/use-x.ts'])
})

test('a baseline row for a file that is now compliant is reported stale', () => {
  const limits = fixture({ baseline: { 'a/use-x.ts': 120 } })
  const { liveViolators } = evaluate(['a/use-x.ts'], () => lines(40), limits)
  assert.deepEqual(staleBaselineEntries(liveViolators, limits), ['a/use-x.ts'])
})

test('a still-violating baseline row is NOT reported stale', () => {
  const limits = fixture({ baseline: { 'a/use-x.ts': 120 } })
  const { liveViolators } = evaluate(['a/use-x.ts'], () => lines(120), limits)
  assert.deepEqual(staleBaselineEntries(liveViolators, limits), [])
})

// GROUP: evaluate-requires-baseline-key
test('evaluate treats a config with no baseline key at all as an empty baseline', () => {
  // MUTATION: read limits.baseline directly instead of `?? {}` → a limits object that
  // omits the key entirely (rather than setting it to {}) throws inside the loop
  // instead of grading the file as an ungrandfathered new violation.
  const limits = {
    rules: [{ kind: 'hook', glob: '**/use-*.ts', max: 80 }],
    excludeBasenamePatterns: [],
    excludeGlobs: [],
  }
  assert.equal('baseline' in limits, false)
  const { regressions } = evaluate(['a/use-x.ts'], () => lines(81), limits)
  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].why, 'new violation')
})

// GROUP: stale-entries-require-baseline-key
test('staleBaselineEntries reports nothing when the config has no baseline key at all', () => {
  // MUTATION: `Object.keys(limits.baseline)` without `?? {}` → throws on a limits
  // object that never had a baseline key, instead of correctly reporting no stale rows.
  const limits = { excludeBasenamePatterns: [], excludeGlobs: [] }
  assert.equal('baseline' in limits, false)
  assert.deepEqual(staleBaselineEntries(new Set(), limits), [])
})

// GROUP: exclusion-check-moved-below-the-read
test('an excluded path is skipped without being read at all', () => {
  // MUTATION: move `isExcluded` back below the read → red. A dangling symlink under an excluded
  // glob produced an `unreadable` regression that blocked every run, and no baseline row could
  // clear it because that branch returns before the baseline is consulted. Exclusion needs no
  // file content, so it must come first.
  const limits = fixture({ excludeGlobs: ['scripts/**'] })
  let reads = 0
  const read = () => {
    reads++
    throw Object.assign(new Error('unreadable'), { code: 'ELOOP' })
  }
  const { regressions } = evaluate(['scripts/dangling.ts'], read, limits)
  assert.deepEqual(regressions, [], 'an excluded path must not produce a finding')
  assert.equal(reads, 0, 'an excluded path must not be read')
})

// ------------------------------------- holes found by post-commit semantic review

// GROUP: ratchet-checks-growth-only
test('a grandfathered file that SHRANK but is still over the limit fails', () => {
  // MUTATION: change `n !== allowed` back to `n > allowed` → this goes red, and with it
  // the same-path content-swap hole reopens: the baseline is keyed on PATH alone, so
  // replacing a baselined file's contents in place with unrelated content that is still
  // over the limit but under the old allowance reported NOTHING — not even a stale-entry
  // warning, since the path never leaves liveViolators. Requiring the recorded number to
  // stay exact turns silent absorption into a visible edit.
  const limits = fixture({ baseline: { 'a/use-x.ts': 120 } })
  const { regressions } = evaluate(['a/use-x.ts'], () => lines(110), limits)
  assert.equal(regressions.length, 1)
  assert.match(regressions[0].why, /tighten the baseline to 110/)
})

test('a grandfathered file that shrank below its limit is stale, not a failure', () => {
  // The boundary between the two mechanisms: once a file is COMPLIANT it leaves the
  // ratchet entirely and is reported as a prunable baseline row instead.
  const limits = fixture({ baseline: { 'a/use-x.ts': 120 } })
  const { regressions, liveViolators } = evaluate(['a/use-x.ts'], () => lines(40), limits)
  assert.deepEqual(regressions, [])
  assert.deepEqual(staleBaselineEntries(liveViolators, limits), ['a/use-x.ts'])
})

// GROUP: unreadable-path-skipped-instead-of-reported
test('a tracked path that cannot be read is reported, not silently skipped', () => {
  // MUTATION: restore the bare `catch { continue }` → a symlink committed to git whose
  // target is absent passes every git-side check (git stores the target TEXT as the blob)
  // while readFileSync follows it and throws ENOENT forever. The path was exempt from
  // every limit, in pre-commit and CI alike, at exit 0.
  const dir = mkdtempSync(join(tmpdir(), 'file-size-dangling-'))
  try {
    const link = join(dir, 'x.ts')
    symlinkSync(join(dir, 'no-such-target.ts'), link)
    const { regressions } = evaluate([link], (f) => readFileSync(f, 'utf8'), fixture())
    assert.equal(regressions.length, 1)
    assert.equal(regressions[0].kind, 'unreadable')
    assert.equal(regressions[0].n, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a path that vanished between enumeration and read still blocks', () => {
  // The other half of the superseded model. A vanished path is now reported rather than
  // skipped: the tree changed underneath the check, so its answer is not trustworthy.
  const gone = join(tmpdir(), `file-size-vanished-${Date.now()}`, 'x.ts')
  const { regressions } = evaluate([gone], (f) => readFileSync(f, 'utf8'), fixture())
  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].kind, 'unreadable')
})

// GROUP: unreadable-message-drops-message-fallback
test('falls back to the raw error message when a read failure carries no error code', () => {
  // MUTATION: drop the `?? err.message` fallback (leave bare `err.code`) → any read
  // failure that is not a real fs error — nothing here guarantees the thrower is
  // `readFileSync` itself, only that `readFile` threw — reports "(undefined)" instead of
  // the actual reason. A plain `Error` (no `.code` property) is exactly that case.
  const dir = mkdtempSync(join(tmpdir(), 'file-size-nocode-'))
  try {
    const file = join(dir, 'x.ts')
    writeFileSync(file, 'irrelevant — read() below is stubbed and ignores this\n')
    const read = () => {
      throw new Error('boom: permission denied')
    }
    const { regressions } = evaluate([file], read, fixture())
    assert.equal(regressions.length, 1)
    assert.equal(regressions[0].kind, 'unreadable')
    assert.match(regressions[0].why, /tracked but unreadable \(boom: permission denied\)/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// GROUP: liveviolators-hoisted-above-exclusion
test('a baseline row for a file that became EXCLUDED is reported stale, not kept alive', () => {
  // MUTATION: hoist `liveViolators.add(file)` above the classify/exclusion check → a file
  // that was baselined and later moved under an exclusion glob (e.g. into scripts/) is
  // wrongly counted as still violating, and staleBaselineEntries never surfaces its now-
  // orphaned baseline row for pruning. Distinct from the "now compliant" case above: that
  // one exits via `n <= rule.max`, this one exits via evaluate's own `isExcluded` check,
  // which returns before `classify` is ever called and before a line count is taken.
  const limits = fixture({ baseline: { 'scripts/a/use-x.ts': 999 } })
  assert.equal(isExcluded('scripts/a/use-x.ts', limits), true)
  const { liveViolators } = evaluate(['scripts/a/use-x.ts'], () => lines(999), limits)
  assert.deepEqual(staleBaselineEntries(liveViolators, limits), ['scripts/a/use-x.ts'])
})
