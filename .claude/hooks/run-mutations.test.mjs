// Run: node --test .claude/hooks/run-mutations.test.mjs
//
// Pure decision logic for the mutation harness. The git-facing path (`runMutation`, which makes
// and destroys a worktree) is deliberately NOT unit-tested here: its whole content is the
// side effects, and a mock of `git worktree` would pin the mock rather than the mechanism. It is
// exercised end-to-end by running the tool.
//
// Every case is MUTATION-PINNED: the opening comment names the exact break that turns THAT test
// red (`code-style.md` § "A Test Must Fail If Its Mechanism Is Removed", and § "A `MUTATION:`
// Comment Is a Prose Claim" — a comment naming a mechanism this fixture cannot reach is a false
// claim, not coverage).

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertSingleOccurrence,
  compareResult,
  main,
  parseArgs,
  parseTap,
  validateDataFile,
} from './run-mutations.mjs'

/** A minimal valid data file; each test overrides exactly the field it is about. */
const validData = () => ({
  target: '.claude/hooks/check-file-size-guard.mjs',
  suites: ['.claude/hooks/check-file-size-guard.directive.test.mjs'],
  mutations: [
    { id: 'drop-directive-scan', find: "'use server'", replace: "'use client'", expectRed: ['a'] },
  ],
})

// ---------------------------------------------------------------- parseTap

test('reads the names of the tests that failed', () => {
  // MUTATION: invert the `!p.ok` filter in parseTap's `failed` computation → the passing test
  // is reported as failed and the failing one is dropped, so every verdict inverts.
  const tap = parseTap(
    ['TAP version 13', 'ok 1 - stays green', 'not ok 2 - goes red', '1..2'].join('\n'),
  )
  assert.deepEqual(tap.failed, ['goes red'])
})

test('reports a green run as no failures rather than as unparseable', () => {
  // MUTATION: make parseTap throw whenever `failed` is empty → SURVIVED, the verdict this whole
  // harness exists to detect, becomes an exit-2 harness fault and is never reported.
  const tap = parseTap(['TAP version 13', 'ok 1 - a', 'ok 2 - b', '1..2'].join('\n'))
  assert.deepEqual(tap.failed, [])
  assert.equal(tap.points.length, 2)
})

test('reports the failing subtest and not the parent that merely propagates it', () => {
  // MUTATION: make isAggregate always return false → the parent's propagated `not ok` joins the
  // failing set, so an exact-set comparison against expectRed can never be satisfied by any
  // suite using subtests and every such mutation reports MISMATCH.
  const tap = parseTap(
    [
      'TAP version 13',
      '    ok 1 - inner passes',
      '    not ok 2 - inner fails',
      '    1..2',
      'not ok 1 - outer group',
      '1..1',
    ].join('\n'),
  )
  assert.deepEqual(tap.failed, ['inner fails'])
})

test('counts a parent that fails on its own while every child passed', () => {
  // MUTATION: widen isAggregate to return true whenever ANY deeper point exists (dropping its
  // `!points[j].ok` test) → a parent that throws in its own body after its children passed is
  // silently dropped from the failing set.
  const tap = parseTap(
    [
      'TAP version 13',
      '    ok 1 - inner passes',
      '    1..1',
      'not ok 1 - outer group',
      '1..1',
    ].join('\n'),
  )
  assert.deepEqual(tap.failed, ['outer group'])
})

test('throws on a stream that never emitted a plan line', () => {
  // MUTATION: delete the `if (!sawPlan) throw` → a crashed or truncated runner reads as a fully
  // green run, i.e. SURVIVED, and the harness blames the test for the harness's own failure.
  assert.throws(() => parseTap('TAP version 13\n# Subtest: a\n'), /no top-level plan line/)
})

test('does not treat a subtest plan as the top-level plan', () => {
  // MUTATION: drop the `indent === 0` condition on the plan check → a stream truncated after a
  // subtest block satisfies the completeness check and is graded as a finished run.
  assert.throws(() => parseTap('TAP version 13\n    ok 1 - inner\n    1..1\n'), /plan line/)
})

test('does not count a TODO-directive failure as a red test', () => {
  // MUTATION: delete the `p.directive !== 'TODO'` filter → an expected-failure test counts as
  // caught, crediting the mutation with a break it did not cause.
  const tap = parseTap(
    ['TAP version 13', 'not ok 1 - known broken # TODO later', 'not ok 2 - real', '1..2'].join(
      '\n',
    ),
  )
  assert.deepEqual(tap.failed, ['real'])
})

test('strips a directive from the test name', () => {
  // MUTATION: delete the directive-stripping branch → the name keeps its "# SKIP ..." suffix and
  // never string-matches an expectRed entry, so the mutation reports MISMATCH.
  const tap = parseTap(['TAP version 13', 'ok 1 - tidies up # SKIP no fixture', '1..1'].join('\n'))
  assert.equal(tap.points[0].name, 'tidies up')
  assert.equal(tap.points[0].directive, 'SKIP')
})

test('reads a test point written without the "-" separator', () => {
  // MUTATION: make the "-" mandatory in parseTap's point regex → a TAP producer that omits it
  // yields zero points, the run looks green, and every mutation in that file reports SURVIVED.
  const tap = parseTap(['TAP version 13', 'not ok 3 bare form', '1..3'].join('\n'))
  assert.deepEqual(tap.failed, ['bare form'])
})

// ---------------------------------------------------------------- compareResult

test('reports CAUGHT when the failing set is exactly the expected set', () => {
  // MUTATION: replace the CAUGHT branch's condition with `false` → nothing is ever caught and
  // the harness reports a finding on every correctly pinned test.
  assert.equal(compareResult(['a', 'b'], ['b', 'a']).status, 'CAUGHT')
})

test('reports SURVIVED when nothing went red at all', () => {
  // MUTATION: delete the `actual.length === 0` early branch → a survival is reported as
  // MISMATCH, which reads as a bookkeeping error rather than as an unpinned test.
  const res = compareResult(['a'], [])
  assert.equal(res.status, 'SURVIVED')
  assert.deepEqual(res.missing, ['a'])
})

test('reports MISMATCH when the break reddens more tests than the claim names', () => {
  // MUTATION: weaken the CAUGHT condition to `missing.length === 0` → a superset passes as
  // CAUGHT, which is precisely the under-specific claim code-style.md §7 forbids.
  const res = compareResult(['a'], ['a', 'b'])
  assert.equal(res.status, 'MISMATCH')
  assert.deepEqual(res.unexpected, ['b'])
})

test('reports MISMATCH when a named test stayed green while another failed', () => {
  // MUTATION: weaken the CAUGHT condition to `unexpected.length === 0` → a claim naming a test
  // the break does not touch passes, so the comment's central assertion is never checked.
  const res = compareResult(['a', 'b'], ['b'])
  assert.equal(res.status, 'MISMATCH')
  assert.deepEqual(res.missing, ['a'])
})

test('reports each differing name once however often it was repeated', () => {
  // MUTATION: drop either `new Set(...)` deduplication → the corresponding side of the report
  // repeats a name, and the operator reads two distinct differences where there is one.
  // (An earlier version of this test asserted CAUGHT on `(['a','a'], ['a'])` and named the same
  // mechanism. It was a FALSE claim: `includes` is indifferent to repetition, so both Sets could
  // be deleted and it stayed green. Caught by running this harness against itself.)
  const res = compareResult(['a', 'a'], ['b', 'b'])
  assert.equal(res.status, 'MISMATCH')
  assert.deepEqual(res.missing, ['a'])
  assert.deepEqual(res.unexpected, ['b'])
})

// ---------------------------------------------------------------- validateDataFile

test('accepts a well-formed data file', () => {
  // MUTATION: make validateDataFile always push a problem → every data file is rejected and the
  // harness exits 2 without running anything, while reporting a data-file fault.
  assert.deepEqual(validateDataFile(validData()), [])
})

test('accepts an empty replacement as a deletion', () => {
  // MUTATION: apply the non-empty-string check to `replace` as well as to `find` → deleting a
  // guard, the most direct mutation there is, becomes unexpressible.
  const data = validData()
  data.mutations[0].replace = ''
  assert.deepEqual(validateDataFile(data), [])
})

test('rejects a data file with no target', () => {
  // MUTATION: delete the `target` check → the runner reads `join(wt, undefined)` and the failure
  // surfaces as an unreadable-file error naming no id.
  const data = validData()
  delete data.target
  assert.match(validateDataFile(data).join('\n'), /`target` must be a non-empty string/)
})

test('rejects a data file with an empty suites list', () => {
  // MUTATION: drop the `.length === 0` half of the suites check → `node --test` is spawned with
  // no files, exits 0 with an empty plan, and every mutation in the file reports SURVIVED.
  const data = validData()
  data.suites = []
  assert.match(validateDataFile(data).join('\n'), /`suites` must be a non-empty array/)
})

test('rejects a mutation with no expectRed', () => {
  // MUTATION: delete the `expectRed` check → compareResult gets an empty expected set, so any
  // red test reports MISMATCH and a genuinely green run reports SURVIVED with nothing named.
  const data = validData()
  delete data.mutations[0].expectRed
  assert.match(validateDataFile(data).join('\n'), /`expectRed` must be a non-empty array/)
})

test('rejects a mutation with an empty find anchor', () => {
  // MUTATION: delete the `find` check → an empty anchor splits the source into (length+1) parts,
  // so assertSingleOccurrence sees a count far from 1 and reports a stale data file instead of
  // the real fault. On a one-character file it would report exactly 1 and mutate nothing.
  const data = validData()
  data.mutations[0].find = ''
  assert.match(validateDataFile(data).join('\n'), /`find` must be a non-empty string/)
})

test('rejects two mutations sharing an id', () => {
  // MUTATION: delete the `seen.has(mut.id)` branch → two entries report under one id and a
  // reader cannot tell which of them produced the verdict.
  const data = validData()
  data.mutations.push({ ...data.mutations[0] })
  assert.match(validateDataFile(data).join('\n'), /duplicate `id`/)
})

test('rejects a notEncoded entry with no stated reason', () => {
  // MUTATION: drop the `why` half of the notEncoded check → a claim can be excused from encoding
  // with no justification, which is the coverage gap laundering itself as coverage.
  const data = validData()
  data.notEncoded = [{ claim: 'MUTATION: something' }]
  assert.match(validateDataFile(data).join('\n'), /notEncoded\[0\]/)
})

test('rejects a notEncoded entry with no stated claim', () => {
  // MUTATION: drop `!isNonEmptyString(n.claim) ||` from the notEncoded entry check → an entry
  // carrying only `why` passes validation; --coverage counts it as accounted-for while --list
  // prints `(not encoded) undefined`, misreporting a gap as closed with no usable description.
  const data = validData()
  data.notEncoded = [{ why: 'because something' }]
  assert.match(validateDataFile(data).join('\n'), /notEncoded\[0\]/)
})

test('rejects a top level that is not an object', () => {
  // MUTATION: delete the Array.isArray half of the top-level check → a JSON array passes, and
  // every field check below then reports a separate misleading problem about a missing key.
  assert.deepEqual(validateDataFile([]), ['<data>: top level must be an object'])
})

// ---------------------------------------------------------------- assertSingleOccurrence

test('accepts an anchor that occurs exactly once', () => {
  // MUTATION: change the condition to `count !== 2` → every correct data file is rejected and
  // the harness exits 2 on a healthy run.
  assert.equal(assertSingleOccurrence('alpha beta gamma', 'beta', 'm1'), 1)
})

test('refuses an anchor that matches nothing, naming the count', () => {
  // MUTATION: change `count !== 1` to `count > 1` → a stale anchor is applied as a no-op and the
  // suites stay green, so the mutation reports SURVIVED and the test is blamed for the data file.
  assert.throws(
    () => assertSingleOccurrence('alpha beta', 'delta', 'm1'),
    /mutation m1: anchor occurs 0 time\(s\).*stale/s,
  )
})

test('refuses an ambiguous anchor that occurs twice', () => {
  // MUTATION: change `count !== 1` to `count === 0` → only the first of two occurrences is
  // replaced, so the break applied is not the break the data file describes.
  assert.throws(
    () => assertSingleOccurrence('beta and beta', 'beta', 'm2'),
    /mutation m2: anchor occurs 2 time\(s\).*ambiguous/s,
  )
})

// ---------------------------------------------------------------- parseArgs

test('defaults to the run mode with no flags', () => {
  // MUTATION: default `mode` to 'list' → the bare command prints ids and exits 0 without running
  // a single mutation, which is indistinguishable from a fully caught run.
  assert.deepEqual(parseArgs([]), { mode: 'run', guard: null, scratch: null })
})

test('reads the value of an option flag', () => {
  // MUTATION: drop the `i++` that consumes an option's value → the value is re-read as the next
  // argument, fails the `--` prefix test, and every option invocation blocks.
  assert.deepEqual(parseArgs(['--guard', 'check-x', '--coverage']), {
    mode: 'coverage',
    guard: 'check-x',
    scratch: null,
  })
})

test('reads --update-expected as a mode', () => {
  assert.deepEqual(parseArgs(['--update-expected']), {
    mode: 'update-expected',
    guard: null,
    scratch: null,
  })
})

test('takes --update-expected together with --guard, which is an option and not a mode', () => {
  assert.deepEqual(parseArgs(['--update-expected', '--guard', 'run-mutations']), {
    mode: 'update-expected',
    guard: 'run-mutations',
    scratch: null,
  })
})

test('blocks two mode flags given together', () => {
  // MUTATION: delete the `new Set(modes).size > 1` check → the first branch tested in main wins
  // and the other request is dropped with no diagnostic at exit 0.
  assert.match(parseArgs(['--list', '--coverage']).error, /separate modes/)
})

test('blocks an unknown flag', () => {
  // MUTATION: replace the unknown-flag return with `continue` → a typo such as `--covrage` is
  // ignored and the tool silently runs the default mode instead of the requested one.
  assert.match(parseArgs(['--covrage']).error, /unknown flag --covrage/)
})

test('blocks a bare positional argument', () => {
  // MUTATION: delete the positional branch → `-list` (one hyphen) falls through to the
  // unknown-flag branch, which is still an error but names the wrong fault. The assertion is on
  // the MESSAGE for exactly that reason; asserting only that `error` is set would not go red.
  assert.match(parseArgs(['-list']).error, /unexpected argument/)
})

test('blocks an option flag given with no value', () => {
  // MUTATION: delete the `value === undefined` test → `opts.guard` becomes undefined, selectFiles
  // treats that as "no guard", and the run silently widens to every data file.
  assert.match(parseArgs(['--guard']).error, /--guard requires a value/)
  assert.match(parseArgs(['--guard', '--list']).error, /--guard requires a value/)
})

// ---------------------------------------------------------------- main

test('exits 2, not 1, on a usage error', () => {
  // MUTATION: return 1 from main's arg-error branch → a broken invocation is reported as a test
  // finding, and the header's whole 1-vs-2 rationale collapses: the cheapest remedy a reader has
  // for "this test is unpinned" is to delete the test.
  assert.equal(main(['--list', '--coverage']), 2)
})

// ---------------------------------------------------------------- validateDataFile (uncovered branches)

test('rejects a suites list that contains a non-string entry', () => {
  // MUTATION: delete the `else if (!obj.suites.every(isNonEmptyString))` branch → a suites list
  // carrying null or a number passes validation; `node --test null` then crashes the runner
  // rather than surfacing a clean validation error before any worktree is made.
  const data = validData()
  data.suites = ['.claude/hooks/check-file-size-guard.directive.test.mjs', null]
  assert.match(validateDataFile(data).join('\n'), /every `suites` entry must be a non-empty string/)
})

test('rejects a data file where mutations is not an array', () => {
  // MUTATION: make the `!Array.isArray(obj.mutations)` condition always false → the string falls
  // through to the `else` branch, which calls `.forEach()` on it and THROWS a TypeError out of
  // validateDataFile. The test still reddens, but by throwing, not by returning a clean problem
  // string — an earlier version of this comment claimed the harness "runs 0 mutations at exit 0",
  // which is what would happen if the else branch were reached safely. It is not.
  const data = validData()
  data.mutations = 'not-an-array'
  assert.match(validateDataFile(data).join('\n'), /`mutations` must be an array/)
})

test('rejects a mutation entry that is not an object', () => {
  // MUTATION: delete the `typeof mut !== 'object'` guard inside the mutations forEach → a string
  // mutation entry falls through to the id/find/replace checks and reports misleading
  // "must be a non-empty string" errors on its undefined properties rather than "must be an object".
  const data = validData()
  data.mutations = ['not-an-object']
  assert.match(validateDataFile(data).join('\n'), /must be an object/)
})

test('rejects a mutation whose replace is not a string', () => {
  // MUTATION: delete the `typeof mut.replace !== 'string'` check → a numeric or null replace
  // passes validation; at apply time `String.prototype.replace(find, 42)` silently coerces and
  // the wrong value is written to the worktree with no diagnostic.
  const data = validData()
  data.mutations[0].replace = 42
  assert.match(validateDataFile(data).join('\n'), /`replace` must be a string/)
})

test('rejects a mutation whose expectRed contains a non-string entry', () => {
  // MUTATION: delete the `else if (!mut.expectRed.every(isNonEmptyString))` branch → an
  // expectRed list containing null passes validation; compareResult then includes null in the
  // exact-set comparison and no real test name matches it, so every such mutation reports MISMATCH.
  const data = validData()
  data.mutations[0].expectRed = ['valid-name', null]
  assert.match(
    validateDataFile(data).join('\n'),
    /every `expectRed` entry must be a non-empty string/,
  )
})

test('rejects a notEncoded value that is not an array', () => {
  // MUTATION: change `!Array.isArray(obj.notEncoded)` to `false` → the non-array falls through to
  // the `else`, whose `.forEach()` THROWS a TypeError. The test reddens by throwing, not by a
  // claim-without-why passing validation — an earlier version of this comment described the
  // latter, which is the outcome only if the forEach were reachable safely. (Deleting the whole line would
  // orphan the `else` below and cause a syntax error — that reddens every test, not just this
  // one, so it is not the break this comment describes.)
  const data = validData()
  data.notEncoded = 'not-an-array'
  assert.match(validateDataFile(data).join('\n'), /`notEncoded` must be an array/)
})

// ---------------------------------------------------------------- parseArgs (--scratch)

test('reads the value of the --scratch option', () => {
  // MUTATION: change `scratch: opts.scratch` to `scratch: null` in parseArgs's return → the
  // caller always receives null for the scratch path and silently uses the default tmpdir,
  // ignoring the user's --scratch flag. The existing --guard test cannot catch this: it
  // asserts `scratch: null` because it never passes --scratch.
  assert.deepEqual(parseArgs(['--scratch', '/tmp/my-scratch']), {
    mode: 'run',
    guard: null,
    scratch: '/tmp/my-scratch',
  })
})

// ------------------------------------------- guards added after the first post-commit cycle

test('rejects a data file whose mutations list is empty', () => {
  // MUTATION: delete the `else if (obj.mutations.length === 0)` branch → an empty list validates,
  // modeRun's loop body never executes, and the run exits 0 having graded nothing. Note the
  // sibling `suites` check was ALREADY length-checked; this test pins the half that was not.
  const problems = validateDataFile({ target: 'f.mjs', suites: ['t.mjs'], mutations: [] })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /must not be empty/)
})

test('rejects a target outside the worktree', () => {
  // MUTATION: delete the containment loop → a '..' target validates and the mutation is written
  // OUTSIDE the throwaway worktree, which cleanup never removes. The traversal case is the one
  // that matters: `join(root, '../../etc/x')` really is '/etc/x', while `join(root, '/etc/x')`
  // stays contained at '<root>/etc/x'. An earlier guard rejected only ABSOLUTE paths under the
  // opposite (false) premise, so it blocked the safe shape and admitted the dangerous one.
  // A relative target must still pass, or every real data file is rejected — all three asserted.
  const abs = validateDataFile({
    target: '/etc/passwd',
    suites: ['t.mjs'],
    mutations: [{ id: 'a', find: 'x', replace: 'y', expectRed: ['t'] }],
  })
  assert.equal(abs.length, 1)
  assert.match(abs[0], /stay inside the worktree/)
  const trav = validateDataFile({
    target: '../../etc/passwd',
    suites: ['t.mjs'],
    mutations: [{ id: 'a', find: 'x', replace: 'y', expectRed: ['t'] }],
  })
  assert.equal(trav.length, 1)
  assert.match(trav[0], /stay inside the worktree/)
  const badSuite = validateDataFile({
    target: 'f.mjs',
    suites: ['../outside.test.mjs'],
    mutations: [{ id: 'a', find: 'x', replace: 'y', expectRed: ['t'] }],
  })
  assert.equal(badSuite.length, 1)
  assert.match(badSuite[0], /suites\[0\]/)
  const rel = validateDataFile({
    target: '.claude/hooks/f.mjs',
    suites: ['t.mjs'],
    mutations: [{ id: 'a', find: 'x', replace: 'y', expectRed: ['t'] }],
  })
  assert.deepEqual(rel, [])
})

test('a skipped test is not counted as a red test', () => {
  // MUTATION: drop `p.directive !== 'SKIP'` from parseTap's filter → a `not ok ... # SKIP` point
  // joins the failing set, so a mutation gets credited with a catch no test earned. The file
  // header already CLAIMED this exclusion before the code did it; the claim is what this pins.
  const tap = 'TAP version 13\nnot ok 1 - skipped case # SKIP\nnot ok 2 - genuinely red\n1..2\n'
  assert.deepEqual(parseTap(tap).failed, ['genuinely red'])
})

test('a skipped child does not make its failing parent look like an aggregate', () => {
  // MUTATION: drop `points[j].directive !== 'SKIP'` from isAggregate → the parent is treated as
  // merely propagating its skipped child and is dropped, while the child is dropped by the
  // `failed` filter; `failed` comes back EMPTY and the run reports SURVIVED though a test was
  // red. Both halves of this comparison must treat directives alike (code-style.md §7).
  const tap = 'TAP version 13\n    not ok 1 - kid # SKIP\n    1..1\nnot ok 1 - parent\n1..1\n'
  assert.deepEqual(parseTap(tap).failed, ['parent'])
})
