// Run: node --test .claude/hooks/run-mutations.parse.test.mjs
//
// `parseSuite` and `groupProblems`: what a suite CLAIMS, and whether its `GROUP:` markers still
// name mutations that exist. Split from run-mutations.test.mjs at the test-file cap in
// .claude/limits.json. Also covers `CONTROL:` marker parsing, which the guard-controls registry
// reads as `tests[].controls` to check every registered guard carries a spawned red and green
// control.

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { groupProblems, parseSuite, renderExpectRed, replaceExpectRed } from './run-mutations.mjs'

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

// GROUP: narrow-mutation-grep
test('counts a claim written mid-line after other prose', () => {
  // MUTATION: narrow the per-line pattern to /\/\/ MUTATION:/ -> a claim that does not open its
  // comment stops counting, the coverage denominator shrinks, and an unencoded claim reads as
  // accounted for. code-style.md §7 records the measurement: the two greps answer different
  // questions. The claim below sits after other prose on a line that still opens with `//`,
  // which is what `scanClaims` requires and what the narrow pattern then misses.
  const parsed = parseSuite(
    [
      "test('behaves', () => {",
      '  // guard note; MUTATION: delete the guard -> x',
      '  assert.ok(1)',
      '})',
      '',
    ].join('\n'),
  )
  assert.equal(parsed.tests[0].claims, 1)
})

// GROUP: claims-add-n-not-one
test('counts every claim on a line, not one per claiming line', () => {
  // MUTATION: make the accumulator `+= 1` instead of `+= n` -> a line carrying two claims counts
  // as one, so a comment naming two breaks reads as half-covered. The fixture's line count (5)
  // differs from its claim count (2) deliberately: with a coinciding fixture a line-counting
  // regression also passes, which is the COALESCE-coincidence vacuity of code-style.md §7.
  const parsed = parseSuite(
    [
      "test('behaves', () => {",
      '  // MUTATION: delete the guard -> x AND MUTATION: flip y -> z',
      '  assert.ok(1)',
      '})',
      '',
    ].join('\n'),
  )
  assert.equal(parsed.tests[0].claims, 2)
})

// GROUP: claims-skip-marker-lines
test('a GROUP marker line is never also counted as a claim, even when it contains MUTATION:', () => {
  // MUTATION: remove the `if (markerLines.has(i)) continue` guard from scanClaims -> the marker
  // line below passes the /^\s*\/\// comment check AND matches MUTATION:, so claims becomes 1
  // instead of 0, inflating the denominator.
  const parsed = parseSuite(
    ['// GROUP: narrow-mutation-grep MUTATION: not a claim', "test('behaves', () => {})", ''].join(
      '\n',
    ),
  )
  assert.equal(parsed.tests[0].claims, 0)
})

// --- CONTROL markers ---------------------------------------------------------

test('a CONTROL: red marker directly above a test marks it red', () => {
  const parsed = parseSuite("// CONTROL: red\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].controls, ['red'])
})

test('a CONTROL: green marker directly above a test marks it green', () => {
  const parsed = parseSuite("// CONTROL: green\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].controls, ['green'])
})

test('a test with no CONTROL: marker carries an empty controls array', () => {
  const parsed = parseSuite("test('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].controls, [])
})

test('CONTROL: and GROUP: markers stacked above one test both attach to it', () => {
  const parsed = parseSuite(
    "// CONTROL: red\n// GROUP: guard-always-passes\ntest('blocks a violation', () => {})\n",
  )
  assert.deepEqual(parsed.tests[0].controls, ['red'])
  assert.deepEqual(parsed.tests[0].groups, ['guard-always-passes'])
})

test('the marker order does not matter — GROUP above CONTROL still attaches both', () => {
  const parsed = parseSuite(
    "// GROUP: guard-always-blocks\n// CONTROL: green\ntest('passes a clean input', () => {})\n",
  )
  assert.deepEqual(parsed.tests[0].controls, ['green'])
  assert.deepEqual(parsed.tests[0].groups, ['guard-always-blocks'])
})

test('a CONTROL marker written inside a body names the test it sits in, not the next one', () => {
  const parsed = parseSuite(
    [
      "test('first', () => {",
      '  // CONTROL: red',
      '  assert.ok(1)',
      '})',
      "test('second', () => {})",
      '',
    ].join('\n'),
  )
  assert.deepEqual(
    parsed.tests.map((t) => t.controls),
    [['red'], []],
  )
})

test('a value other than red or green is not recognised as a CONTROL marker', () => {
  const parsed = parseSuite("// CONTROL: yellow\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.tests[0].controls, [])
})

test('a CONTROL marker line is never also counted as a claim', () => {
  const parsed = parseSuite("// CONTROL: red\ntest('behaves', () => {})\n")
  assert.equal(parsed.tests[0].claims, 0)
})

test('a CONTROL marker separated from every test by code belongs to the header, not a test', () => {
  const parsed = parseSuite("// CONTROL: red\nconst helper = () => 1\ntest('behaves', () => {})\n")
  assert.deepEqual(parsed.header.controls, ['red'])
  assert.deepEqual(parsed.tests[0].controls, [])
})

// --- expectRed writer -------------------------------------------------------
// `renderExpectRed` and `replaceExpectRed`: the text surgery behind --update-expected. It edits
// the data file as TEXT because re-serialising reformats every line and buries the ones the
// author meant to change.

/** One entry, `expectRed` written on one line, a `note` after it. */
const ONE_LINE = `{
  "target": "t.mjs",
  "suites": ["s.test.mjs"],
  "mutations": [
    {
      "id": "alpha",
      "find": "a",
      "replace": "b",
      "expectRed": ["one"],
      "note": "kept"
    }
  ]
}
`

test('rewriting an expectRed leaves every other byte of the file alone', () => {
  const out = replaceExpectRed(ONE_LINE, 'alpha', ['one', 'two'])
  assert.equal(out, ONE_LINE.replace('["one"]', '["one", "two"]'))
})

test('the comma after expectRed survives a rewrite', () => {
  const out = replaceExpectRed(ONE_LINE, 'alpha', ['x'])
  assert.match(out, /"expectRed": \["x"\],\n {6}"note"/)
})

test('an expectRed too long for one line is written one name per line', () => {
  const names = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)]
  const out = replaceExpectRed(ONE_LINE, 'alpha', names)
  assert.match(out, /"expectRed": \[\n {8}"a{40}",\n {8}"b{40}",\n {8}"c{40}"\n {6}\],/)
})

test('a multi-line expectRed collapses back to one line when the names fit', () => {
  const multi = replaceExpectRed(ONE_LINE, 'alpha', ['a'.repeat(40), 'b'.repeat(40)])
  const back = replaceExpectRed(multi, 'alpha', ['one'])
  assert.equal(back, ONE_LINE)
})

test('a quote inside a test name is escaped the way the data files already write it', () => {
  const out = replaceExpectRed(ONE_LINE, 'alpha', ['reads a point without the "-" separator'])
  assert.equal(JSON.parse(out).mutations[0].expectRed[0], 'reads a point without the "-" separator')
  assert.match(out, /\\"-\\"/)
})

test('an em dash is written as itself, not as an escape sequence', () => {
  const out = replaceExpectRed(ONE_LINE, 'alpha', ['a — b'])
  assert.match(out, /"a — b"/)
})

test('an id that appears nowhere is refused by name, and nothing is returned', () => {
  assert.throws(() => replaceExpectRed(ONE_LINE, 'missing', ['x']), /no entry missing/)
})

test('two entries sharing an id are refused rather than editing whichever comes first', () => {
  // `validateDataFile` rejects a duplicate id on load, so the grading path cannot reach this.
  // `replaceExpectRed` is exported and text-level, and splicing the first of two silently edits
  // an entry the caller did not name.
  const entry = ONE_LINE.slice(ONE_LINE.indexOf('    {'), ONE_LINE.indexOf('\n  ]'))
  const doubled = ONE_LINE.replace(entry, `${entry},\n${entry}`)
  assert.throws(() => replaceExpectRed(doubled, 'alpha', ['x']), /alpha occurs 2 times/)
})

test('an id quoted inside a note is not mistaken for a second entry', () => {
  const quoted = ONE_LINE.replace('"kept"', '"see \\"id\\": \\"alpha\\" above"')
  const out = replaceExpectRed(quoted, 'alpha', ['x'])
  assert.deepEqual(JSON.parse(out).mutations[0].expectRed, ['x'])
  assert.match(out, /see \\"id\\": \\"alpha\\" above/)
})

test('an expectRed that is not a flat array of strings is refused rather than spliced', () => {
  const nested = ONE_LINE.replace('["one"]', '[["one"]]')
  assert.throws(() => replaceExpectRed(nested, 'alpha', ['x']), /not a flat array/)
})

test('an expectRed the text never closes is refused rather than spliced', () => {
  // Truncated AT the array: anything after it would hit the illegal-character refusal first,
  // so only a genuine run to EOF exercises this branch.
  const open = ONE_LINE.slice(0, ONE_LINE.indexOf('["one"]') + 6)
  assert.throws(() => replaceExpectRed(open, 'alpha', ['x']), /never closed/)
})

test('rewriting a second entry leaves the first rewrite intact', () => {
  const two = ONE_LINE.replace(
    '    }\n  ]',
    '    },\n    {\n      "id": "beta",\n      "find": "c",\n      "replace": "d",\n      "expectRed": ["two"]\n    }\n  ]',
  )
  const out = replaceExpectRed(replaceExpectRed(two, 'alpha', ['A']), 'beta', ['B'])
  const parsed = JSON.parse(out)
  assert.deepEqual(
    parsed.mutations.map((m) => m.expectRed),
    [['A'], ['B']],
  )
})

test('every expectRed in the repo re-renders to the bytes already on disk', () => {
  // Pins the width rule against a biome.json change: lefthook reformats staged JSON, so a writer
  // whose width disagrees is corrected AFTER the human reviewed the diff.
  const dir = import.meta.dirname
  const files = readdirSync(dir).filter((f) => f.endsWith('.mutations.json'))
  assert.ok(files.length > 0, 'no data files found — the check would pass vacuously')
  let arrays = 0
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8')
    for (const mut of JSON.parse(text).mutations) {
      arrays++
      assert.equal(replaceExpectRed(text, mut.id, mut.expectRed), text, `${f} ${mut.id}`)
    }
  }
  assert.ok(arrays > 100, `expected the real corpus, saw ${arrays} arrays`)
})

// --- renderExpectRed boundary -----------------------------------------------
// The 100-column limit is biome's formatter.lineWidth. `hasComma` adds 1 to the
// width sum, so the comma shifts the single-line/multi-line boundary by exactly
// one column.  These two tests pin both the `<=` comparison and the `hasComma`
// term: removing either makes one of the pair green while the other goes red.

test('fits one line when the total is exactly 100 columns without a trailing comma', () => {
  // MUTATION: change `<=` to `<` in the renderExpectRed width guard -> 100-col
  // output switches to multi-line even though it fits the budget.
  // indent(6) + EXPECT_KEY(13) + oneLine(81) + comma(0) = 100
  const indent = '      '
  const name = 'a'.repeat(77) // oneLine = '["' + 77 + '"]' = 81 chars
  const result = renderExpectRed(indent, [name], false)
  assert.equal(result, `${indent}"expectRed": ["${name}"]`)
})

test('switches to multi-line when a trailing comma pushes the total past 100', () => {
  // MUTATION: delete `(hasComma ? 1 : 0)` from the width sum -> comma-present
  // output stays on one line instead of being split, corrupting the format that
  // biome would rewrite at commit time.
  // indent(6) + EXPECT_KEY(13) + oneLine(81) + comma(1) = 101 > 100
  const indent = '      '
  const name = 'a'.repeat(77)
  const result = renderExpectRed(indent, [name], true)
  assert.match(result, /"expectRed": \[\n/)
})

// --- scanStringArrayEnd via replaceExpectRed --------------------------------

test('a test name containing ] is not mistaken for the array close', () => {
  // MUTATION: remove the `if (inString)` guard in scanStringArrayEnd -> a `]`
  // inside a quoted string triggers the early-return, corrupting the splice.
  //
  // `scanStringArrayEnd` is called on the EXISTING array text, so the fixture
  // must already hold a name with `]` — rewriting it exercises the guard.
  const withBracket = ONE_LINE.replace('["one"]', '["step [1] passes"]')
  const out = replaceExpectRed(withBracket, 'alpha', ['updated'])
  assert.deepEqual(JSON.parse(out).mutations[0].expectRed, ['updated'])
})
