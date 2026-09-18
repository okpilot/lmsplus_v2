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
  // MUTATION: in `ownerFor`, delete the downward scan and always return the `ownerAbove` result
  // -> a marker written above its test attaches to the PREVIOUS test. Encoded as
  // `ownerfor-never-looks-down`.
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
  // title or a string literal holding the token is counted as a claim. Encoded as
  // `claims-scan-every-line`.
  const parsed = parseSuite("test('counts a MUTATION: token in a title', () => {})\n")
  assert.equal(parsed.tests[0].claims, 0)
  assert.equal(parsed.header.claims, 0)
})

test('a claim token inside a string literal is fixture text, not a claim', () => {
  const parsed = parseSuite("test('behaves', () => {\n  const s = '// MUTATION: not a claim'\n})\n")
  assert.equal(parsed.tests[0].claims, 0)
})

test('a claim written directly above the first test belongs to that test', () => {
  // MUTATION: make `ownerFor`'s downward scan skip blank lines only, not comment lines -> a claim
  // in a multi-line comment block never reaches the test below it. Encoded as
  // `ownerfor-stops-at-comments`.
  const parsed = parseSuite("// MUTATION: break the thing\ntest('behaves', () => {})\n")
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

test('an id naming no mutation in the data file is reported as a problem', () => {
  // MUTATION: make `groupProblems` return an empty array unconditionally -> a GROUP id naming no
  // mutation is never reported and a stale reference runs silently. Encoded as
  // `groupproblems-never-reports`.
  const parsed = parseSuite("// GROUP: ghost\ntest('behaves', () => {})\n")
  const problems = groupProblems(parsed, new Set(['real']), 'suite.test.mjs')
  assert.equal(problems.length, 1)
  assert.match(problems[0], /suite\.test\.mjs:2.*ghost/)
})

test('no problem is reported when every id resolves to a mutation', () => {
  const parsed = parseSuite("// GROUP: real, other\ntest('behaves', () => {})\n")
  assert.deepEqual(groupProblems(parsed, new Set(['real', 'other']), 'suite.test.mjs'), [])
})
