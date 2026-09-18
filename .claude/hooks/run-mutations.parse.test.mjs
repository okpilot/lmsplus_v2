// Run: node --test .claude/hooks/run-mutations.parse.test.mjs
//
// `parseSuite` and `groupProblems`: what a suite CLAIMS, and whether its `GROUP:` markers still
// name mutations that exist. Split from run-mutations.test.mjs at the test-file cap in
// .claude/limits.json.

import assert from 'node:assert/strict'
import test from 'node:test'
import { groupProblems, parseSuite } from './run-mutations.mjs'

test('a marker directly above a test names that test', () => {
  const parsed = parseSuite("// GROUP: alpha\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.header.groups, [])
  assert.deepEqual(
    parsed.tests.map((t) => [t.line, t.groups]),
    [[2, ['alpha']]],
  )
})

test('a marker written inside a body names the test it sits in, not the next one', () => {
  // MUTATION: let the downward scan in `ownerFor` skip CODE as well as blanks and comments
  // -> the scan runs out of this test's body and finds the NEXT test, so a marker written beside
  // the assertion it governs is credited to the wrong test.
  // GROUP: ownerfor-scan-skips-code
  const parsed = parseSuite(
    [
      "test('first', () => {",
      '  // GROUP: alpha',
      '  assert.ok(1)',
      '})',
      "test('second', () => {})",
      '',
    ].join('\n'),
  )
  assert.deepEqual(
    parsed.tests.map((t) => t.groups),
    [['alpha'], []],
  )
})

test('an id list wrapped onto a continuation line keeps every id', () => {
  const parsed = parseSuite("// GROUP: alpha, beta,\n// gamma, delta\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].groups, ['alpha', 'beta', 'gamma', 'delta'])
})

test('a claim token in a test title is fixture text, not a claim', () => {
  // MUTATION: delete the comment-line guard in the claim loop -> every line is scanned, so a test
  // title or a string literal holding the token is counted as a claim.
  // GROUP: claims-scan-every-line
  const parsed = parseSuite("test('counts a MUTATION: token in a title', () => {})\n")
  assert.equal(parsed.tests[0].claims, 0)
  assert.equal(parsed.header.claims, 0)
})

test('a claim token inside a string literal is fixture text, not a claim', () => {
  const parsed = parseSuite("test('behaves', () => {\n  const s = '// MUTATION: not a claim'\n})\n")
  assert.equal(parsed.tests[0].claims, 0)
})

test('a claim written directly above the first test belongs to that test', () => {
  const parsed = parseSuite("// MUTATION: break the thing\ntest('behaves', () => {})\n")
  assert.equal(parsed.tests[0].claims, 1)
  assert.equal(parsed.header.claims, 0)
})

test('a claim in a multi-line comment block belongs to the test below it', () => {
  // MUTATION: make `ownerFor`'s downward scan skip blank lines only, not comment lines -> a claim
  // whose comment block runs more than one line never reaches the test below it, and lands on the
  // file instead.
  // GROUP: ownerfor-stops-at-comments
  const parsed = parseSuite(
    "// MUTATION: break the thing\n// and here is the second line\ntest('behaves', () => {})\n",
  )
  assert.equal(parsed.tests[0].claims, 1)
  assert.equal(parsed.header.claims, 0)
})

test('a claim separated from every test by code belongs to the file, not to a test', () => {
  const parsed = parseSuite(
    "// MUTATION: break the thing\nconst helper = () => 1\ntest('behaves', () => {})\n",
  )
  assert.equal(parsed.header.claims, 1)
  assert.equal(parsed.tests[0].claims, 0)
})

// MUTATION: in ownerFor, drop the indent comparison so the nearest test above owns a comment
// that has left its body -> a file-level claim sitting between one test and the next helper is
// counted on that test, and a GROUP marker there makes it read as linked.
// GROUP: ownerfor-reaches-past-the-body
test('a claim below a closed test body belongs to the file, not to that test', () => {
  const parsed = parseSuite(
    "test('behaves', () => {\n  assert.ok(true)\n})\n// MUTATION: break the thing\nconst helper = () => 1\n",
  )
  assert.equal(parsed.header.claims, 1)
  assert.equal(parsed.tests[0].claims, 0)
})

test('an id naming no mutation in the data file is reported as a problem', () => {
  // MUTATION: make `groupProblems` return an empty array unconditionally -> a GROUP id naming no
  // mutation is never reported and a stale reference runs silently.
  // GROUP: groupproblems-never-reports
  const parsed = parseSuite("// GROUP: ghost\ntest('behaves', () => {})\n")
  const problems = groupProblems(parsed, new Set(['real']), 'suite.test.mjs')
  assert.equal(problems.length, 1)
  assert.match(problems[0], /suite\.test\.mjs:2.*ghost/)
})

test('no problem is reported when every id resolves to a mutation', () => {
  const parsed = parseSuite("// GROUP: real, other\ntest('behaves', () => {})\n")
  assert.deepEqual(groupProblems(parsed, new Set(['real', 'other']), 'suite.test.mjs'), [])
})

test('a claim above a modifier form such as it.skip belongs to that test, not the file', () => {
  // MUTATION: drop the `(?:\.\w+)?` from TEST_LINE_RE -> `it.skip(`, `test.each(` and `.only`
  // stop being test lines, and every claim and marker written above one silently reattaches to
  // the nearest test ABOVE it, or to the header. A wrong owner reads exactly like a right one.
  // GROUP: testline-no-modifier
  const parsed = parseSuite("// MUTATION: break\nit.skip('title', () => {})\n")
  assert.equal(parsed.tests.length, 1)
  assert.equal(parsed.tests[0].claims, 1)
  assert.equal(parsed.header.claims, 0)
})

test('an empty GROUP id list registers no ids and does not crash', () => {
  // "// GROUP: " (space after colon, nothing else) matches GROUP_MARKER_RE with an empty capture.
  // After split+trim+filter the id array is empty, so no ids are pushed onto the owner.
  const parsed = parseSuite("// GROUP: \ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].groups, [])
})

test('a GROUP marker written without a space after // is not recognised', () => {
  // GROUP_MARKER_RE is /^\s*\/\/ GROUP: /, which requires a space between // and GROUP.
  // "//GROUP: alpha" has no space; the regex does not match, so no ids are attached.
  const parsed = parseSuite("//GROUP: alpha\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].groups, [])
})

test('test( appearing inside a comment line is not counted as a test line', () => {
  // TEST_LINE_RE is anchored with ^ so only lines beginning with optional whitespace then
  // "test" or "it" qualify.  A "// " prefix prevents the match.
  const parsed = parseSuite("// test('not-a-test', () => {})\ntest('real', () => {})\n")
  assert.equal(parsed.tests.length, 1)
  assert.equal(parsed.tests[0].line, 2)
})

test('a duplicate id in one GROUP marker is attached twice and reported twice when dangling', () => {
  // Both copies are pushed; groupProblems iterates groups linearly, so each dangling id
  // produces its own problem string regardless of duplicates.
  const parsed = parseSuite("// GROUP: ghost, ghost\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].groups, ['ghost', 'ghost'])
  const problems = groupProblems(parsed, new Set(), 'suite.test.mjs')
  assert.equal(problems.length, 2)
})

test('the same GROUP id named by two different tests produces two dangling-id problems', () => {
  // Each test's groups list is checked independently; the same dangling id appearing in two
  // tests produces two entries rather than being deduplicated across tests.
  const parsed = parseSuite(
    "// GROUP: ghost\ntest('first', () => {})\n// GROUP: ghost\ntest('second', () => {})\n",
  )
  const problems = groupProblems(parsed, new Set(), 'suite.test.mjs')
  assert.equal(problems.length, 2)
})

test('a continuation line that is not an id list ends the marker instead of joining it', () => {
  // MUTATION: drop the ID_LIST_RE test from readMarker's continuation guard -> a trailing comma
  // on the last id line swallows the NEXT comment, and its words are split into phantom ids that
  // abort the run naming references nobody wrote.
  // GROUP: marker-continues-on-any-comment
  const parsed = parseSuite(
    [
      '// GROUP: id-one,',
      '// id-two,',
      '// prose that is not an id list',
      "test('behaves', () => {})",
      '',
    ].join('\n'),
  )
  assert.deepEqual(parsed.tests[0].groups, ['id-one', 'id-two'])
})

test('a suite written with CRLF line endings still yields its markers', () => {
  // MUTATION: stop stripping the trailing \r in parseSuite -> no `$`-anchored pattern can match
  // past it, so every marker in a CRLF file vanishes and the suite reports as fully unlinked.
  // GROUP: crlf-left-on-the-line
  const parsed = parseSuite("// GROUP: alpha\r\ntest('behaves', () => {})\r\n")
  assert.deepEqual(parsed.tests[0].groups, ['alpha'])
})
