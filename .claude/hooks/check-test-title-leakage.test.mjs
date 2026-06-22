// Unit tests for the §7 test-title impl-leakage guard (#946).
// Run: node --test .claude/hooks/check-test-title-leakage.test.mjs

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeTitle, extractAddedTitles, splitByFile } from './check-test-title-leakage.mjs'

// --- Disallowed §7 forms: each MUST be flagged ----------------------------

const DISALLOWED = [
  // forwards X to <InternalName> (camelCase + PascalCase)
  'forwards calcMode to startQuizSession',
  'forwards the answer to AnswerOptions',
  // from <PascalCaseType>(Opts|Config|Args)
  'builds the payload from QuizConfig',
  'reads filters from StartExamArgs',
  // through/via <name>(
  'rejects empty input through validateInput(',
  'normalizes via formatScore(',
  // <branch> guard
  'rejects bad count with the non-positive guard',
  'handles the typeof guard',
  'handles the NaN guard',
  // activates/does not activate the guard
  'activates the guard when answers exist',
  'does not activate the guard when empty',
  // matches <Type> — internal OR external named types are both flagged (§7 intent
  // is behavior-first phrasing regardless of where the type comes from).
  'matches QuizSessionResult',
  'value matches AuthError',
  // maps <snake_case_token> — error codes AND DB field names are both flagged.
  'maps admin_not_found',
  'maps not_authenticated to a friendly message',
  'maps question_type to the dropdown',
]

for (const title of DISALLOWED) {
  test(`flags disallowed title: "${title}"`, () => {
    assert.notEqual(analyzeTitle(title), null, `expected "${title}" to be flagged`)
  })
}

// --- §7 Permitted forms + ordinary behavior titles: MUST NOT be flagged ---

const PERMITTED = [
  // The explicit §7 "Permitted" examples (public prop / public SDK / RPC boundary).
  'calls onClick when the button is clicked',
  'calls signInWithPassword on valid submit',
  'does not call the RPC when the input is empty',
  // Ordinary behavior-first titles that resemble — but are not — the disallowed shapes.
  'schedules a shorter review interval when the answer is wrong',
  'maps the response to display rows', // "maps the" — not a snake_case token
  'matches the snapshot', // "matches the" — lowercase, not a PascalCase type
  'renders the question card',
  'forwards the click to the parent', // "to the parent" — not an internal Name
  'navigates forward to ResultsPage', // singular "forward" — natural-language navigation, not the §7 `forwards` shape
  'reads the count from the server', // "from the" — no PascalType+Opts/Config/Args
  'shows a guard rail on the chart', // "guard" not in a flagged phrase
]

for (const title of PERMITTED) {
  test(`does not flag permitted/behavior title: "${title}"`, () => {
    assert.equal(analyzeTitle(title), null, `expected "${title}" NOT to be flagged`)
  })
}

// --- extractAddedTitles: diff-scoping ------------------------------------

test('extractAddedTitles picks up only added it()/test() titles with new-file line numbers', () => {
  const diff = [
    '@@ -10,0 +11,2 @@',
    "+  it('maps admin_not_found', () => {",
    "+  it('calls onClick when clicked', () => {",
  ].join('\n')
  const found = extractAddedTitles(diff)
  assert.equal(found.length, 2)
  assert.deepEqual(found[0], { line: 11, title: 'maps admin_not_found' })
  assert.deepEqual(found[1], { line: 12, title: 'calls onClick when clicked' })
})

test('extractAddedTitles ignores removed and context lines', () => {
  const diff = [
    '@@ -5,2 +5,1 @@',
    "-  it('forwards calcMode to startQuizSession', () => {", // removed — must be ignored
    "   it('renders the card', () => {", // context (no +) — must be ignored
  ].join('\n')
  assert.deepEqual(extractAddedTitles(diff), [])
})

test('extractAddedTitles handles double and template quotes', () => {
  const diff = [
    '@@ -0,0 +1,2 @@',
    '+  it("maps not_authenticated", () => {',
    '+  test(`matches QuizConfig`, () => {}',
  ].join('\n')
  const found = extractAddedTitles(diff)
  assert.deepEqual(
    found.map((f) => f.title),
    ['maps not_authenticated', 'matches QuizConfig'],
  )
})

test('extractAddedTitles handles escaped quotes inside a title', () => {
  // The TITLE_RE `\\.` branch must consume an escaped delimiter so the title is
  // not truncated — otherwise a violation could slip past as a false negative.
  const diff = '@@ -0,0 +1 @@\n+  it("maps not_found when user\\"s token expired", () => {})'
  const found = extractAddedTitles(diff)
  assert.equal(found.length, 1)
  assert.equal(found[0].title, 'maps not_found when user\\"s token expired')
  assert.notEqual(analyzeTitle(found[0].title), null) // the maps pattern still fires
})

test('extractAddedTitles handles the it.each(...) form', () => {
  const diff = "@@ -0,0 +1 @@\n+  it.each([1, 2])('maps code_not_found for %s', () => {})"
  const found = extractAddedTitles(diff)
  assert.equal(found.length, 1)
  assert.equal(found[0].title, 'maps code_not_found for %s')
})

test('extractAddedTitles tracks line numbers across a second hunk', () => {
  const diff = [
    '@@ -1,0 +5,1 @@',
    "+  it('maps first_token', () => {})",
    '@@ -10,0 +20,1 @@',
    "+  it('maps second_token', () => {})",
  ].join('\n')
  const found = extractAddedTitles(diff)
  assert.deepEqual(found, [
    { line: 5, title: 'maps first_token' },
    { line: 20, title: 'maps second_token' }, // counter reset by the 2nd @@ header
  ])
})

test('extractAddedTitles handles the test() and test.each() function forms', () => {
  const diff = [
    '@@ -0,0 +1,2 @@',
    "+  test('maps admin_error', () => {})",
    "+  test.each([1])('matches ConfigOpts', () => {})",
  ].join('\n')
  const found = extractAddedTitles(diff)
  assert.deepEqual(
    found.map((f) => f.title),
    ['maps admin_error', 'matches ConfigOpts'],
  )
})

test('extractAddedTitles handles the it.only/it.skip/test.concurrent modifier forms', () => {
  // The guard must still catch a disallowed title behind a test modifier —
  // `it.only`/`it.skip` are common in real test files. TITLE_RE's method-chain
  // group spans the modifier; this pins it against a future regex regression.
  const diff = [
    '@@ -0,0 +1,3 @@',
    "+  it.only('maps admin_error', () => {})",
    "+  it.skip('forwards calcMode to startQuizSession', () => {})",
    "+  test.concurrent('renders the chart', () => {})",
  ].join('\n')
  const found = extractAddedTitles(diff)
  assert.deepEqual(
    found.map((f) => f.title),
    ['maps admin_error', 'forwards calcMode to startQuizSession', 'renders the chart'],
  )
  // The two disallowed titles are still flagged through the modifier; the third is clean.
  assert.notEqual(analyzeTitle(found[0].title), null)
  assert.notEqual(analyzeTitle(found[1].title), null)
  assert.equal(analyzeTitle(found[2].title), null)
})

test('extractAddedTitles detects a split-form title (it( and title on separate added lines)', () => {
  const diff = ['@@ -0,0 +5,3 @@', '+  it(', "+    'maps admin_not_found',", '+    () => {})'].join(
    '\n',
  )
  const found = extractAddedTitles(diff)
  assert.equal(found.length, 1)
  assert.equal(found[0].title, 'maps admin_not_found')
  assert.equal(found[0].line, 5) // attributed to the line where `it(` starts
  assert.notEqual(analyzeTitle(found[0].title), null) // still flagged
})

test('extractAddedTitles does not join across a removed line', () => {
  // A removed `it(` followed by an added title literal must NOT be stitched into a match.
  const diff = ['@@ -5,1 +5,1 @@', '-  it(', "+    'maps admin_not_found',"].join('\n')
  assert.deepEqual(extractAddedTitles(diff), [])
})

test('extractAddedTitles does not false-positive when a non-whitespace added line separates it( from the title', () => {
  // TITLE_RE uses \s* between `(` and the opening quote, so a non-whitespace
  // line inside the run must NOT produce a match — the run is buffered but the
  // regex boundary rejects it.
  const diff = [
    '@@ -0,0 +10,4 @@',
    '+  it(',
    '+    someCode()', // non-whitespace added line — NOT whitespace, so \s* cannot span it
    "+    'maps admin_not_found',",
    '+    () => {}))',
  ].join('\n')
  assert.deepEqual(extractAddedTitles(diff), [])
})

test('extractAddedTitles detects two split-form titles in one contiguous run with correct line attribution', () => {
  // Both titles must be found and attributed to the line where their `it(` starts.
  const diff = [
    '@@ -0,0 +1,6 @@',
    '+  it(',
    "+    'maps admin_not_found',",
    '+    () => {})',
    '+  it(',
    "+    'forwards calcMode to startQuizSession',",
    '+    () => {})',
  ].join('\n')
  const found = extractAddedTitles(diff)
  assert.equal(found.length, 2)
  assert.equal(found[0].title, 'maps admin_not_found')
  assert.equal(found[0].line, 1) // first `it(` is on new-file line 1
  assert.equal(found[1].title, 'forwards calcMode to startQuizSession')
  assert.equal(found[1].line, 4) // second `it(` starts on new-file line 4
  assert.notEqual(analyzeTitle(found[0].title), null)
  assert.notEqual(analyzeTitle(found[1].title), null)
})

// --- splitByFile ----------------------------------------------------------

test('splitByFile separates a multi-file diff by new path', () => {
  const diff = [
    'diff --git a/a.test.ts b/a.test.ts',
    '@@ -0,0 +1 @@',
    "+  it('maps x_y', () => {})",
    'diff --git a/b.test.ts b/b.test.ts',
    '@@ -0,0 +1 @@',
    "+  it('ok', () => {})",
  ].join('\n')
  const parts = splitByFile(diff)
  assert.equal(parts.length, 2)
  assert.equal(parts[0].file, 'a.test.ts')
  assert.equal(parts[1].file, 'b.test.ts')
  assert.equal(extractAddedTitles(parts[0].body)[0].title, 'maps x_y')
})

test('integration: detects only the violating title across multiple files', () => {
  const diff = [
    'diff --git a/a.test.ts b/a.test.ts',
    '@@ -0,0 +1 @@',
    "+  it('calls onClick when clicked', () => {})", // clean (permitted)
    'diff --git a/b.test.ts b/b.test.ts',
    '@@ -0,0 +1 @@',
    "+  it('maps admin_error', () => {})", // violation
  ].join('\n')
  const violations = splitByFile(diff)
    .flatMap((p) => extractAddedTitles(p.body).map((t) => ({ ...t, file: p.file })))
    .filter((t) => analyzeTitle(t.title) !== null)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].title, 'maps admin_error')
  assert.equal(violations[0].file, 'b.test.ts')
})
