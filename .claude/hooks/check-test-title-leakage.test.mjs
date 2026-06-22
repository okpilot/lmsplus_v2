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
