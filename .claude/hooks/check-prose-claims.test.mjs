// Run: node --test .claude/hooks/check-prose-claims.test.mjs
//
// Pure decision logic for the prose-claims guard. The git-facing and subprocess paths live
// in check-prose-claims.repo.test.mjs, so neither file approaches the test-file cap in
// .claude/limits.json.
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns it red, and
// every break was EXECUTED before being written down (`code-style.md` §7 — a `MUTATION:` line
// is a prose claim). Some breaks redden a GROUP of cases rather than one; those carry a
// `GROUP:` marker naming the mutation id. The EXACT set each break reddens is DATA, in
// check-prose-claims.mutations.json, and `node .claude/hooks/run-mutations.mjs --guard
// check-prose-claims` re-derives it — do not hand-maintain a second copy here.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  capValues,
  claimKey,
  commentProse,
  completedSpecDirs,
  contextRe,
  evaluate,
  findClaims,
  kindWords,
  markdownProse,
  parseWaiver,
  proseLines,
  stagedPaths,
  staleBaselineEntries,
} from './check-prose-claims.mjs'

/** A limits fixture, so no case depends on the live rule set. */
const LIMITS = {
  rules: [
    { kind: 'test file', glob: '**/*.test.*', max: 500 },
    { kind: 'SQL migration', glob: 'supabase/migrations/**/*.sql', max: 300 },
    { kind: 'page file', glob: '**/page.tsx', max: 80 },
    { kind: 'Server Action file', glob: '**/*.ts', max: 100, requiresUseServer: true },
    { kind: 'React component', glob: '**/*.tsx', max: 150 },
    { kind: 'utility/helper', glob: '**/*.ts', max: 200 },
  ],
}

const CAPS = capValues(LIMITS)
const CTX = contextRe(LIMITS)
const claims = (line) => findClaims(line, CAPS, CTX)
const values = (line) => claims(line).map((c) => c.value)

// ---------------------------------------------------------------- derivation from limits

test('derives the cap set from limits.json instead of a typed list', () => {
  // MUTATION: add a value limits.json does not contain to the cap set (`caps.add(42)` beside the
  // derived add) → derivation still happens, but an unrelated 42-line helper now reads as a cap
  // claim. The assertion compares the WHOLE derived set, so any addition or omission reddens it.
  // GROUP: caps-not-derived-from-limits
  assert.deepEqual(
    [...CAPS].sort((a, b) => a - b),
    [80, 100, 150, 200, 300, 500],
  )
})

test('refuses a limits file that yields no enforceable cap', () => {
  // MUTATION: return `caps` without the size check → a limits file whose rules went missing
  // makes every claim unrecognisable and the guard reports green having graded nothing.
  assert.throws(() => capValues({ rules: [] }), /no integer rules\[\]\.max/)
  assert.throws(() => capValues({}), /no integer rules\[\]\.max/)
})

test('derives kind words from the rule set and keeps the short forms', () => {
  // MUTATION: drop EXTRA_KIND_WORDS from kindWords's seed → "the <N>-line util cap" and
  // "a <N>-line component" stop being recognised, and those are the commonest phrasings.
  const words = kindWords(LIMITS)
  assert.ok(words.has('migration'), 'derived from rules[].kind')
  assert.ok(words.has('component'), 'short form')
  assert.ok(words.has('util'), 'short form the long kind "utility/helper" does not supply')
})

// ---------------------------------------------------------------- claim detection

test('flags a cap value restated in prose as a line count', () => {
  // MUTATION: make findClaims return [] for the LINE_SHAPE loop → the guard's entire
  // headline true positive goes silent.
  assert.deepEqual(values('split it to stay under the 500-line test cap'), [500])
  assert.deepEqual(values('a hook is limited to 80 lines'), [80])
})

test('ignores a line count that is not a cap value', () => {
  // MUTATION: delete the `caps.has(value)` test in the LINE_SHAPE loop → every line count
  // in the corpus becomes a finding, which is unshippable at any noise budget.
  // GROUP: caps-not-derived-from-limits, line-shape-cap-membership-removed
  assert.deepEqual(values('the file is 501 lines and over its cap'), [])
  assert.deepEqual(values('a 42-line helper'), [])
})

test('ignores a cap value with no cap or kind word on the line', () => {
  // MUTATION: delete the `nearby(line, ctxRe, ...)` test → a bare "<N> lines" anywhere in
  // the corpus fires, and the cap values are among the commonest integers in these docs.
  // GROUP: line-shape-context-not-required
  assert.deepEqual(values('we deleted 500 lines of dead narrative'), [])
})

test('requires the context word within the proximity bound, not merely on the line', () => {
  // MUTATION: raise PROXIMITY, or replace `gap(...) <= PROXIMITY` with `true` → long
  // markdown table rows and SQL snippets match by accident. This was the dominant
  // false-positive class in calibration; the bound is what made the guard shippable.
  // GROUP: line-shape-context-not-required
  assert.deepEqual(values(`500 lines${' '.repeat(26)}cap`), [500], 'just inside the bound')
  assert.deepEqual(values(`500 lines${' '.repeat(27)}cap`), [], 'just outside it')
})

test('flags the compliance-ratio shape when the word line is adjacent', () => {
  // MUTATION: make findClaims return [] for the RATIO_SHAPE loop → "(n/<cap> lines)", the
  // shape docs/plan.md uses to record a near-cap file, stops being a claim.
  const found = claims('use-session-state.ts is now 79/80 lines')
  // GROUP: line-shape-context-not-required
  assert.deepEqual(
    found.map((c) => [c.value, c.shape]),
    [[80, 'ratio']],
  )
})

test('ignores a ratio with no line word near it', () => {
  // MUTATION: replace the RATIO_SHAPE loop's `nearby(line, LINE_WORD_RE, ...)` with `true`
  // → SQL column arithmetic and date fragments match. Unrequired, this shape was the one
  // narrowing that nearly got the ratio form dropped entirely.
  assert.deepEqual(values('we are at 79/80 of the cap'), [])
  assert.deepEqual(values('applied 3/500 of the budget'), [])
})

test('ignores a number glued to a word, a version segment or a ticket reference', () => {
  // MUTATION: drop the leading char class from LINE_SHAPE → "1500 lines", "v500 lines" and
  // "#500 lines" all tokenise as the bare cap 500.
  for (const s of ['1500 lines cap', 'v500 lines cap', '2.500 lines cap', '#500 lines cap']) {
    // GROUP: line-shape-cap-membership-removed
    assert.deepEqual(values(s), [], s)
  }
})

test('ignores a number welded to the word lines with no separator', () => {
  // MUTATION: make LINE_SHAPE's separator optional → "500lines", a token rather than a
  // sentence, reads as a claim.
  assert.deepEqual(values('the 500lines cap'), [])
})

// ---------------------------------------------------------------- prose extraction

test('skips a fenced code block', () => {
  // MUTATION: delete the fence tracking in markdownProse → every worked example and every
  // pasted JSON fragment in the corpus becomes prose. `"max": 500` inside a fence is data.
  const md = [
    'a 500-line cap in prose',
    '```json',
    '{ "max": 500, "kind": "test file" }',
    '```',
    'tail',
  ].join('\n')
  const kept = markdownProse(md).map((l) => l.n)
  // GROUP: markdown-fence-not-tracked
  assert.deepEqual(kept, [1, 5])
})

test('closes a fence only on a fence of the same character and length', () => {
  // MUTATION: drop the character/length comparison in the fence-close branch → a `~~~`
  // inside a ```-fenced block closes it, and everything after it is graded as prose.
  // Closing early at the `~~~` would release line 4 as prose and then re-open at line 5,
  // swallowing the real prose line instead — [4] rather than [6].
  const md = ['````', 'code', '~~~', 'still code', '````', 'prose'].join('\n')
  // GROUP: markdown-fence-not-tracked
  assert.deepEqual(
    markdownProse(md).map((l) => l.n),
    [6],
  )
})

test('skips an indented code block but keeps an indented list item', () => {
  // MUTATION: delete the list-marker carve-out from the indented-block test → nested
  // bullets, which the rules files use heavily, all drop out of scope silently.
  const md = [
    'intro',
    '',
    '    a 500-line cap in a code block',
    '    - the 200-line util cap',
  ].join('\n')
  assert.deepEqual(
    markdownProse(md).map((l) => l.n),
    [1, 2, 4],
  )
})

test('reads only comment lines in a code file, never its data', () => {
  // MUTATION: make commentProse return every line → `{ max: 500 }` fixtures in the hook
  // suites flood the run. code-style.md §1 bans the number in PROSE; data is the point.
  const js = [
    'const limits = { max: 500 } // not a comment line',
    '// the 500-line test cap',
    '  * a 200-line util cap',
  ].join('\n')
  assert.deepEqual(
    commentProse(js).map((l) => l.n),
    [2, 3],
  )
})

test('treats a file with no prose form as carrying none', () => {
  // MUTATION: fall through to markdownProse for an unknown extension → .claude/limits.json,
  // the canonical file, starts flagging its own `"max": 500` rows.
  assert.deepEqual(proseLines('.claude/limits.json', '{ "max": 500, "kind": "test file cap" }'), [])
  assert.equal(proseLines('.claude/rules/x.md', 'a 500-line cap').length, 1)
  assert.equal(proseLines('.claude/hooks/x.mjs', '// a 500-line cap').length, 1)
})

// ---------------------------------------------------------------- waivers

test('accepts an inline waiver carrying a written reason', () => {
  // MUTATION: delete the WAIVER_RE branch in parseWaiver → the escape hatch disappears and
  // the only remedy for a genuine need becomes a baseline row, which costs nothing.
  // GROUP: waiver-never-recognised
  assert.deepEqual(
    parseWaiver(
      'a 500-line cap <!-- prose-claim-ok: this line quotes the historical value a fix corrected -->',
    ),
    {
      reason: 'this line quotes the historical value a fix corrected',
    },
  )
  assert.equal(parseWaiver('a 500-line cap'), null)
})

test('rejects a waiver whose reason asserts nothing', () => {
  // MUTATION: delete the length floor and the EMPTY_REASONS test → "// prose-claim-ok: ok"
  // suppresses a finding at zero cost, and the hatch stops costing anything.
  for (const r of ['ok', 'false positive', 'noise', 'too short']) {
    // GROUP: waiver-never-recognised, waiver-reason-floor-removed
    assert.ok(parseWaiver(`// prose-claim-ok: ${r}`).problem, r)
  }
})

// ---------------------------------------------------------------- baseline keys

test('keys a claim on its content, not on its line number', () => {
  // MUTATION: fold the line number into claimKey → every baselined row goes stale on any
  // edit made ABOVE it, and the remedy for that noise is to stop reading the baseline.
  assert.equal(claimKey('docs/x.md', '  a 500-line cap  '), claimKey('docs/x.md', 'a 500-line cap'))
  assert.notEqual(claimKey('docs/x.md', 'a 500-line cap'), claimKey('docs/y.md', 'a 500-line cap'))
  assert.notEqual(claimKey('docs/x.md', 'a 500-line cap'), claimKey('docs/x.md', 'a 300-line cap'))
})

// ---------------------------------------------------------------- evaluate / stale

test('a waived line yields no claim and therefore no baseline row', () => {
  // MUTATION: drop the `if (waiver) continue` in evaluate → a waived line still becomes a
  // claim, so waiving one also silently demands a baseline row for it.
  const files = ['docs/a.md']
  const read = () =>
    'the cap here is 500 lines for a test file <!-- prose-claim-ok: quotes the value a migration guide fixed -->\n'
  // GROUP: waived-line-still-becomes-a-claim, waiver-never-recognised
  assert.equal(evaluate(files, read, LIMITS).claims.size, 0)
})

test('an unusable waiver is reported as a problem, never a silent pass', () => {
  // MUTATION: `continue` without pushing to `problems` on `waiver.problem` → an empty
  // reason suppresses the finding exactly as a written one does.
  const res = evaluate(
    ['docs/a.md'],
    () =>
      '// prose-claim-ok: ok\nthe cap here is 500 lines for a test file // prose-claim-ok: ok\n',
    LIMITS,
  )
  // GROUP: unusable-waiver-not-reported, waiver-never-recognised, waiver-reason-floor-removed
  assert.equal(res.problems.length, 1)
  assert.equal(res.claims.size, 0)
})

test('an unreadable corpus file is a problem, never a skipped file', () => {
  // MUTATION: `continue` without pushing to `problems` in evaluate's read catch → a
  // permission bit or a mid-run tree change makes a whole file invisible at exit 0.
  const read = () => {
    throw Object.assign(new Error('nope'), { code: 'EACCES' })
  }
  const res = evaluate(['docs/a.md'], read, LIMITS)
  assert.equal(res.problems.length, 1)
  assert.match(res.problems[0].problem, /EACCES/)
})

test('reports a baseline row that describes no live claim as stale', () => {
  // MUTATION: return [] from staleBaselineEntries → the ratchet stops being shrink-only.
  // An edited or deleted claim line leaves its row behind forever and nothing notices.
  const res = evaluate(['docs/a.md'], () => 'the cap here is 500 lines for a test file\n', LIMITS)
  const live = [...res.claims.keys()][0]
  // GROUP: stale-baseline-rows-never-reported
  assert.deepEqual(
    staleBaselineEntries(res.claims, { [live]: 'x', 'docs/a.md@deadbeefdeadbeef': 'y' }),
    ['docs/a.md@deadbeefdeadbeef'],
  )
})

// ---------------------------------------------------------------- completed specs

test('excludes a spec whose tasks are all complete', () => {
  // MUTATION: invert the `!content.includes('- [ ]')` test → live specs are excluded and
  // completed ones graded, which is the exclusion backwards in both directions.
  const files = ['.spec-workflow/specs/done/tasks.md', '.spec-workflow/specs/live/tasks.md']
  const read = (p) => (p.includes('/done/') ? '- [x] a\n- [x] b\n' : '- [x] a\n- [ ] b\n')
  // GROUP: completed-spec-test-inverted
  assert.deepEqual(completedSpecDirs(files, read), ['.spec-workflow/specs/done'])
})

test('treats a spec with an unreadable tasks.md as live', () => {
  // MUTATION: push the dir in completedSpecDirs's catch instead of continuing → one
  // unreadable tasks.md silently unwatches a whole spec tree. Checking is the fail-safe
  // direction: including a completed spec is merely noisy.
  const read = () => {
    throw new Error('nope')
  }
  assert.deepEqual(completedSpecDirs(['.spec-workflow/specs/x/tasks.md'], read), [])
})

// ---------------------------------------------------------------- staged enumeration

test('takes both paths of a staged rename', () => {
  // MUTATION: set `count` to 1 unconditionally in stagedPaths → the NUL stream desyncs on the
  // first rename, so the rename's DESTINATION is read as the next status token, fails the
  // `/^[A-Z]\d*$/` shape, and the desync check THROWS. Traced, not predicted: silent wrong
  // scoping at exit 0 is what that check PREVENTS, not what this break produces — the test
  // below pins the check itself. (`--name-only` loses the source the same way, one path.)
  const raw = Buffer.from(
    ['M', 'docs/a.md', 'R100', 'docs/old.md', 'docs/new.md', 'A', 'docs/c.md', ''].join('\0'),
  )
  assert.deepEqual(stagedPaths(raw), ['docs/a.md', 'docs/old.md', 'docs/new.md', 'docs/c.md'])
})

test('aborts on a desynchronised name-status stream', () => {
  // MUTATION: `continue` instead of throwing on an unrecognised status → a desync is
  // absorbed and the guard grades a scope nobody chose, silently.
  assert.throws(
    () => stagedPaths(Buffer.from(['M', 'docs/a.md', 'docs/b.md'].join('\0'))),
    /unrecognised/,
  )
})

// ---------------------------------------------------------------- block comments and fences

// MUTATION: delete the `if (inBlock)` branch at the top of commentProse's callback.
// A block whose body carries no leading `*` is then invisible again, which is the hole cloud
// review found: a cap restated inside one bypassed the guard entirely.
test('reads the body of a block comment whose lines carry no leading star', () => {
  const src = ['/*', '  a util cap sentence', '*/', 'const x = 1'].join('\n')
  assert.deepEqual(
    commentProse(src).map((p) => p.text.trim()),
    ['/*', 'a util cap sentence', '*/'],
  )
})

// MUTATION: change the opener test to `line.includes('/*')` instead of the anchored
// `/^\s*\/\*/` → a `/*` inside a string or regex opens a phantom block and every later line is
// graded as prose. The first cut of this fix did exactly that and produced 17 false findings.
test('does not open a block on a slash-star inside a string', () => {
  const src = ["const re = '/*'", 'const cap = 1', 'more code'].join('\n')
  assert.deepEqual(commentProse(src), [])
})

// MUTATION: drop the `line.slice(fenceOpen[0].length).trim() === ''` term from the fence
// closer → an inner ```js opener closes the outer fence and the code after it is graded as
// prose. CommonMark requires a bare closer; the first cut checked only length and character.
test('does not let an info-string opener close an open fence', () => {
  const md = ['```', 'inner ```js opener', 'still code', '```', 'real prose'].join('\n')
  assert.deepEqual(
    markdownProse(md).map((p) => p.text),
    ['real prose'],
  )
})

// MUTATION: drop the occurrence argument from the claimKey call in evaluate (pass only
// path/text) → two identical restatements in one file collapse onto one key, so once the first
// is baselined the second is admitted silently. Found by cloud review.
test('keys a repeated identical claim separately from its first occurrence', () => {
  const limits = { rules: [{ kind: 'utility/helper', max: 200 }] }
  const line = 'the util cap is 200 lines'
  const res = evaluate(['docs/x.md'], () => [line, 'filler', line].join('\n'), limits)
  assert.equal(res.claims.size, 2)
})
