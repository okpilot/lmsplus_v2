// Run: node --test .claude/hooks/check-decisions-ledger.test.mjs
//
// Pure decision logic for the decisions-ledger guard (Decision 86). The git-facing paths
// (commit-msg index read, --base per-commit tree reads, absent-vs-fault probing) live in
// check-decisions-ledger.repo.test.mjs.
//
// Every case is MUTATION-PINNED: the opening comment names the exact break that turns it
// red. The EXACT set each break reddens is DATA, in check-decisions-ledger.mutations.json —
// `node .claude/hooks/run-mutations.mjs --guard check-decisions-ledger` re-derives it.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkFormat,
  checkImmutability,
  checkNumbering,
  checkUnit,
  parseLedger,
  parseWaivers,
  splitMarkers,
} from './check-decisions-ledger.mjs'

const GOOD_REASON = 'because this is a genuinely safe correction'

// ---------------------------------------------------------------- splitMarkers

test('strips a single trailing marker sentence', () => {
  const { body, markers } = splitMarkers('## 20 — 2026-03-11 — text. #15 Amended by 73.')
  assert.equal(body, '## 20 — 2026-03-11 — text. #15')
  assert.deepEqual([...markers], ['Amended 73'])
})

// GROUP: marker-comma-list-not-split
test('splits a comma list of numbers into one marker per number', () => {
  // MUTATION: stop splitting the comma list → "Amended by 20, 82." becomes one opaque
  // marker instead of two, so a NEW line missing just the "82" amendment reads as unchanged.
  const { markers } = splitMarkers('## 15 — 2026-03-11 — text. #10 Amended by 20, 82.')
  assert.deepEqual([...markers].sort(), ['Amended 20', 'Amended 82'])
})

// GROUP: marker-loop-single-pass, marker-anchor-not-end-of-line
test('strips two trailing marker sentences chained together', () => {
  // MUTATION: run MARKER_ONE_RE once instead of looping → only the LAST marker sentence is
  // stripped, so a second appended marker corrupts the body comparison.
  // MUTATION: drop the trailing `$` from MARKER_ONE_RE → the FIRST marker matches, the body is
  // cut there and the later marker is lost.
  const { body, markers } = splitMarkers(
    '## 80 — 2026-09-22 — text. #1336 Superseded by 90. Amended by 84.',
  )
  assert.equal(body, '## 80 — 2026-09-22 — text. #1336')
  assert.deepEqual([...markers].sort(), ['Amended 84', 'Superseded 90'])
})

test('does not treat a mid-sentence "Superseded by N" phrase as a marker', () => {
  // Decision 86's own text: the phrase sits mid-sentence, followed by more prose, so the
  // end-anchored pattern must never touch it.
  const line =
    '## 86 — 2026-09-23 — docs/decisions.md holds one line per decision, never edited; a later decision adds a new line and marks the old one Superseded by N (or Amended by N). #1349'
  const { body, markers } = splitMarkers(line)
  assert.equal(body, line)
  assert.equal(markers.size, 0)
})

// ---------------------------------------------------------------- parseLedger

// GROUP: header-split-loop-off-by-one
test('splits header from entries at the first ## line', () => {
  // MUTATION: start the entry scan one line early/late → the last header line leaks into
  // entries (F1 then flags it) or the first entry leaks into the header (I3 then fires on
  // every commit, since the header comparison would include a real decision line).
  const text =
    '# Decisions\n\n> rule text\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second.\n'
  const { header, entries } = parseLedger(text)
  assert.equal(header, '# Decisions\n\n> rule text\n')
  assert.deepEqual(entries, ['## 14 — 2026-03-11 — first.', '## 15 — 2026-03-11 — second.'])
})

// GROUP: parseledger-blank-lines-not-skipped
test('skips a blank line between entries rather than treating it as a malformed entry', () => {
  // MUTATION: drop the `raw.trim() === ''` skip → a blank line between entries is pushed as
  // an entry, F1 reports it as malformed, and every commit with a blank separator line fails.
  const text = '# Decisions\n\n## 14 — 2026-03-11 — first.\n\n## 15 — 2026-03-11 — second.\n'
  const { entries } = parseLedger(text)
  assert.deepEqual(entries, ['## 14 — 2026-03-11 — first.', '## 15 — 2026-03-11 — second.'])
})

// Covered by parseledger-blank-lines-not-skipped above: a trailing '\n' is one extra ''
// element from split('\n'), and the blank-line skip in the entries loop discards it — no
// separate mechanism, so no separate mutation claim.
test('does not treat a trailing newline as a trailing blank entry', () => {
  const text = '# Decisions\n\n## 14 — 2026-03-11 — only.\n'
  assert.equal(parseLedger(text).entries.length, 1)
})

// ---------------------------------------------------------------- checkFormat (F1)

// GROUP: f1-format-check-dropped
test('flags an entry line missing the second em-dash separator', () => {
  // MUTATION: force checkFormat to always return [] → a completely malformed entry line
  // ships unchecked, and F1 stops meaning anything.
  const offenders = checkFormat(['## 14 2026-03-11 — missing a dash'])
  assert.equal(offenders.length, 1)
})

test('flags an entry line with a malformed date', () => {
  const offenders = checkFormat(['## 14 — 2026-3-11 — bad date'])
  assert.equal(offenders.length, 1)
})

test('accepts a well-formed entry line', () => {
  assert.deepEqual(checkFormat(['## 14 — 2026-03-11 — text. #10']), [])
})

// ---------------------------------------------------------------- checkNumbering (F2)

// GROUP: f2-numbering-check-dropped
test('flags a gap in decision numbering', () => {
  // MUTATION: drop F2's `!== previous + 1` comparison → the 14 → 16 gap passes.
  const offenders = checkNumbering(['## 14 — 2026-03-11 — a.', '## 16 — 2026-03-11 — b.'])
  assert.equal(offenders.length, 1)
  assert.match(offenders[0], /## 16 follows ## 14, expected ## 15/)
})

test('flags a duplicated decision number', () => {
  const offenders = checkNumbering(['## 14 — 2026-03-11 — a.', '## 14 — 2026-03-11 — b.'])
  assert.equal(offenders.length, 1)
})

test('accepts strictly consecutive numbers starting above 1', () => {
  assert.deepEqual(
    checkNumbering([
      '## 14 — 2026-03-11 — a.',
      '## 15 — 2026-03-11 — b.',
      '## 16 — 2026-03-11 — c.',
    ]),
    [],
  )
})

test('does not let a malformed entry line break numbering for the well-formed ones around it', () => {
  // GROUP: check-decisions-ledger-numbering-skips-malformed
  // MUTATION: stop filtering to entries that parsed under ENTRY_RE before checking numbering
  // → the malformed line (no number to compare) throws or silently desyncs the sequence.
  const offenders = checkNumbering([
    '## 14 — 2026-03-11 — a.',
    'not a decision line at all',
    '## 15 — 2026-03-11 — b.',
  ])
  assert.deepEqual(offenders, [])
})

// ---------------------------------------------------------------- checkImmutability (I1/I2/I3)

const OLD_LEDGER = parseLedger(
  '# Decisions\n\n> rule\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision. Amended by 20.\n',
)

// GROUP: i1-missing-entry-dropped
test('flags an OLD entry number missing entirely from NEW (I1)', () => {
  const newLedger = parseLedger(
    '# Decisions\n\n> rule\n\n## 15 — 2026-03-11 — second decision. Amended by 20.\n',
  )
  const offenders = checkImmutability(OLD_LEDGER, newLedger)
  assert.equal(
    offenders.some((o) => o.token === '14' && o.kind === 'missing'),
    true,
  )
})

// GROUP: i2-body-check-dropped
test('flags an OLD entry whose body text changed (I2)', () => {
  const newLedger = parseLedger(
    '# Decisions\n\n> rule\n\n## 14 — 2026-03-11 — a DIFFERENT decision.\n## 15 — 2026-03-11 — second decision. Amended by 20.\n',
  )
  const offenders = checkImmutability(OLD_LEDGER, newLedger)
  assert.equal(
    offenders.some((o) => o.token === '14' && o.kind === 'body'),
    true,
  )
})

// GROUP: i2-marker-subset-dropped
test('flags an OLD entry whose marker was dropped, not just changed (I2)', () => {
  // MUTATION: drop the dropped-marker check → a line that lost its marker passes.
  const newLedger = parseLedger(
    '# Decisions\n\n> rule\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision.\n',
  )
  const offenders = checkImmutability(OLD_LEDGER, newLedger)
  assert.equal(
    offenders.some((o) => o.token === '15' && o.kind === 'marker'),
    true,
  )
})

test('allows an OLD entry to gain an additional marker on top of its old one', () => {
  const newLedger = parseLedger(
    '# Decisions\n\n> rule\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision. Amended by 20, 30.\n',
  )
  assert.deepEqual(checkImmutability(OLD_LEDGER, newLedger), [])
})

// GROUP: i3-header-check-dropped
test('flags a changed header (I3)', () => {
  const newLedger = parseLedger(
    '# Decisions\n\n> a DIFFERENT rule\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision. Amended by 20.\n',
  )
  const offenders = checkImmutability(OLD_LEDGER, newLedger)
  assert.equal(
    offenders.some((o) => o.token === 'header'),
    true,
  )
})

test('reports no findings when NEW only appends a new line', () => {
  const newLedger = parseLedger(
    '# Decisions\n\n> rule\n\n## 14 — 2026-03-11 — first decision.\n## 15 — 2026-03-11 — second decision. Amended by 20.\n## 16 — 2026-03-12 — a brand new decision.\n',
  )
  assert.deepEqual(checkImmutability(OLD_LEDGER, newLedger), [])
})

// ---------------------------------------------------------------- parseWaivers

test('parses a well-formed Ledger-edit-ok trailer', () => {
  const { waivers, problems } = parseWaivers(`fix: reword\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n`)
  assert.equal(problems.length, 0)
  assert.equal(waivers.get('14'), GOOD_REASON)
})

test('accepts the header token', () => {
  const { waivers } = parseWaivers(`fix: reword\n\nLedger-edit-ok: header — ${GOOD_REASON}\n`)
  assert.equal(waivers.has('header'), true)
})

// GROUP: waiver-reason-length-check-dropped
test('rejects a Ledger-edit-ok trailer whose reason is too short', () => {
  const { problems } = parseWaivers('fix: reword\n\nLedger-edit-ok: 14 — too short\n')
  assert.equal(problems.length, 1)
})

test('rejects a Ledger-edit-ok trailer whose reason is a blocklisted empty phrase', () => {
  const { problems } = parseWaivers('fix: reword\n\nLedger-edit-ok: 14 — intentional\n')
  assert.equal(problems.length, 1)
})

test('accepts a colon separator, not only an em dash', () => {
  const { waivers } = parseWaivers(`fix: reword\n\nLedger-edit-ok: 14: ${GOOD_REASON}\n`)
  assert.equal(waivers.get('14'), GOOD_REASON)
})

// ---------------------------------------------------------------- parseWaivers: trailer-block only

// GROUP: waiver-not-scoped-to-trailer-block
test('a Ledger-edit-ok line in a body paragraph does not waive', () => {
  // MUTATION: scan the whole message instead of only the LAST paragraph → a line describing
  // the trailer SYNTAX in prose (not a real trailer) reads as one — exactly what a24e439b's
  // own commit body produced: `(note) … matched no finding: <N|header>`.
  const message = `fix: reword decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n\nThis paragraph is unrelated trailing prose, not a trailer.\n`
  const { waivers } = parseWaivers(message)
  assert.equal(waivers.has('14'), false)
})

test('the same line in the final paragraph does waive', () => {
  const message = `fix: reword decision 14\n\nThis paragraph is unrelated body prose.\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n`
  const { waivers } = parseWaivers(message)
  assert.equal(waivers.get('14'), GOOD_REASON)
})

// GROUP: waiver-line-trimmed-before-match
test('an indented line in the final paragraph does not waive', () => {
  // MUTATION: trim the line before matching TRAILER_RE → an indented line (a quoted example
  // inside body prose, not a real trailer) matches anyway.
  const message = `fix: reword decision 14\n\n  Ledger-edit-ok: 14 — ${GOOD_REASON}\n`
  const { waivers } = parseWaivers(message)
  assert.equal(waivers.has('14'), false)
})

// GROUP: waiver-comment-lines-not-stripped
test('a trailing git commit-template comment block does not hide the trailer paragraph before it', () => {
  // MUTATION: skip stripping `#`-prefixed comment lines → the template's trailing comment
  // block (added by `git commit` without -m) becomes the "last paragraph" instead of the
  // real trailer above it, and the waiver is lost.
  const message = `fix: reword decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n\n# Please enter the commit message for your changes.\n# Lines starting with '#' will be ignored.\n`
  const { waivers } = parseWaivers(message)
  assert.equal(waivers.get('14'), GOOD_REASON)
})

// GROUP: scissors-not-truncated
test('a git commit -v scissors line drops the diff below it before scanning for the trailer', () => {
  // MUTATION: skip truncating at the scissors line → the diff lines below it (no '#' prefix)
  // become the "last paragraph" instead of the real trailer above the scissors.
  const message = [
    'fix: reword decision 14',
    '',
    `Ledger-edit-ok: 14 — ${GOOD_REASON}`,
    '',
    '# ------------------------ >8 ------------------------',
    '# Do not modify or remove the line above.',
    'diff --git a/docs/decisions.md b/docs/decisions.md',
    '+## 14 — 2026-03-11 — first decision, EDITED.',
  ].join('\n')
  const { waivers } = parseWaivers(message)
  assert.equal(waivers.get('14'), GOOD_REASON)
})

// ---------------------------------------------------------------- checkUnit (integration of the pure pieces)

test('both OLD and NEW absent is a clean run', () => {
  const res = checkUnit({ oldText: null, newText: null, message: 'chore: unrelated\n' })
  assert.deepEqual(res, { problems: [], offenders: [], unusedWaivers: [] })
})

// GROUP: deleted-file-finding-dropped
test('flags a whole-file deletion when OLD is present and NEW is absent', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n## 14 — 2026-03-11 — a.\n',
    newText: null,
    message: 'chore: remove\n',
  })
  assert.equal(
    res.offenders.some((o) => o.kind === 'deleted'),
    true,
  )
})

// GROUP: unchanged-file-skip-dropped
test('a commit that leaves a malformed ledger untouched is clean', () => {
  const ledger = '# Decisions\n\n## 14 2026-03-11 broken\n'
  const res = checkUnit({ oldText: ledger, newText: ledger, message: 'chore: readme\n' })
  assert.deepEqual(res, { problems: [], offenders: [], unusedWaivers: [] })
})

test('OLD absent (new file, or unborn HEAD) skips immutability checks but still runs F1/F2', () => {
  const res = checkUnit({
    oldText: null,
    newText: '# Decisions\n\n## 14 2026-03-11 broken\n',
    message: 'chore: init\n',
  })
  assert.equal(
    res.offenders.some((o) => o.kind === 'format'),
    true,
  )
})

test('a Ledger-edit-ok trailer waives exactly the finding for its token', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second.\n',
    newText: '# Decisions\n\n## 14 — 2026-03-11 — first, EDITED.\n## 15 — 2026-03-11 — second.\n',
    message: `fix: correct decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n`,
  })
  assert.deepEqual(res.offenders, [])
})

// GROUP: waiver-token-not-matched
test('a Ledger-edit-ok trailer for one token does not waive a finding on a different token', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second.\n',
    newText:
      '# Decisions\n\n## 14 — 2026-03-11 — first, EDITED.\n## 15 — 2026-03-11 — second, EDITED.\n',
    message: `fix: correct decision 14\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n`,
  })
  assert.equal(
    res.offenders.some((o) => o.token === '15'),
    true,
  )
})

test('reports a waiver token that matched no finding, without blocking', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n',
    newText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — new one.\n',
    message: `chore: append\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n`,
  })
  assert.deepEqual(res.offenders, [])
  assert.deepEqual(res.unusedWaivers, ['14'])
})

// GROUP: waiver-reason-length-check-dropped
test('an unusable waiver reason is reported as a problem, not silently ignored', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n',
    newText: '# Decisions\n\n## 14 — 2026-03-11 — first, EDITED.\n',
    message: 'fix: correct decision 14\n\nLedger-edit-ok: 14 — nope\n',
  })
  assert.equal(res.problems.length, 1)
  assert.deepEqual(res.offenders, [])
})

test('a format or numbering finding is never waivable (token is always null)', () => {
  const res = checkUnit({
    oldText: null,
    newText: '# Decisions\n\n## 14 2026-03-11 broken\n',
    message: `chore: init\n\nLedger-edit-ok: 14 — ${GOOD_REASON}\n`,
  })
  assert.equal(
    res.offenders.some((o) => o.kind === 'format'),
    true,
  )
  assert.deepEqual(res.unusedWaivers, ['14'])
})

test('appending a new line with no edits to existing lines is clean', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n',
    newText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-12 — a new one.\n',
    message: 'chore: append decision 15\n',
  })
  assert.deepEqual(res, { problems: [], offenders: [], unusedWaivers: [] })
})

test('appending a marker to an existing line with no other edit is clean', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second.\n',
    newText:
      '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second. Superseded by 16.\n## 16 — 2026-03-12 — third.\n',
    message: 'chore: decision 16 supersedes 15\n',
  })
  assert.deepEqual(res, { problems: [], offenders: [], unusedWaivers: [] })
})

// GROUP: header-token-not-waivable
test('a Ledger-edit-ok: header trailer waives a changed header', () => {
  const res = checkUnit({
    oldText: '# Decisions\n\n> rule\n\n## 14 — 2026-03-11 — first.\n',
    newText: '# Decisions\n\n> a DIFFERENT rule\n\n## 14 — 2026-03-11 — first.\n',
    message: `chore: reword rule text\n\nLedger-edit-ok: header — ${GOOD_REASON}\n`,
  })
  assert.deepEqual(res.offenders, [])
})

test('changing a marker number without waiving it is flagged', () => {
  const res = checkUnit({
    oldText:
      '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second. Superseded by 16.\n',
    newText:
      '# Decisions\n\n## 14 — 2026-03-11 — first.\n## 15 — 2026-03-11 — second. Superseded by 99.\n',
    message: 'chore: oops\n',
  })
  assert.equal(
    res.offenders.some((o) => o.token === '15' && o.kind === 'marker'),
    true,
  )
})
