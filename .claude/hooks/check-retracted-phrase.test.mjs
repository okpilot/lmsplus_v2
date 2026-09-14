// Run: node --test .claude/hooks/check-retracted-phrase.test.mjs
//
// Pure decision logic for the retracted-phrase guard. The git-facing paths live in
// check-retracted-phrase.repo.test.mjs so neither file approaches the 500-line test cap.
//
// Every case is MUTATION-PINNED: the opening comment names the exact break that turns it
// red. A test whose mechanism can be deleted without the test failing certifies nothing
// (`code-style.md` § "A Test Must Fail If Its Mechanism Is Removed").

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  candidatesFor,
  parseHunks,
  parseWaivers,
  reAdded,
  tokensOf,
} from './check-retracted-phrase.mjs'

const nums = (line) => tokensOf(line).nums
const files = (line) => tokensOf(line).files

// ---------------------------------------------------------------- NUM tokenisation

test('tokenises a number welded to a following word by a hyphen', () => {
  // MUTATION: tighten NUM_RE's trailing lookahead to (?![0-9A-Za-z_.-]) → "1807-line", the
  // exact shape of the instance this guard was built for, stops tokenising and the guard's
  // headline true positive goes silent.
  assert.deepEqual(nums('a 1807-line GENERATED file'), ['1807'])
})

test('tokenises a number inside parentheses', () => {
  // MUTATION: add "(" to NUM_RE's lookbehind class → "(1807 lines)" stops tokenising, which
  // is the other half of the flagship (the limits.json side of the same correction).
  assert.deepEqual(nums('types.ts is GENERATED (1807 lines) — the generator owns it'), ['1807'])
})

test('ignores a four-digit year', () => {
  // MUTATION: delete the 1900..2099 range test → every date in the corpus becomes a claim
  // candidate. Note this must be a RANGE, not "any 4-digit token": widening it to the latter
  // excludes 1807 and kills the flagship.
  assert.deepEqual(nums('promoted 2026 after the 1807 finding'), ['1807'])
})

test('ignores a number written as an issue or PR reference', () => {
  // MUTATION: delete ISSUE_PREFIX_RE → bare ticket references become claims. This was the
  // single largest noise class in the 120-commit calibration.
  for (const ref of ['#832', '(#832', 'PR 832', 'PR #832', 'issue 832', 'issues/832', 'GH-832']) {
    assert.deepEqual(nums(`see ${ref} for context`), [], ref)
  }
})

test('ignores a migration number', () => {
  // MUTATION: drop the mig/migration alternative from ISSUE_PREFIX_RE → "mig 120" is read as
  // a claim. Measured: this alone accounted for historical hits across two commits.
  assert.deepEqual(nums('added in mig 120 and migration 121'), [])
})

test('ignores a zero-padded migration fragment', () => {
  // MUTATION: delete the leading-zero exclusion → "029", "002" tokenise as claims. These are
  // migration-number fragments and produced false hits in the calibration run.
  assert.deepEqual(nums('see 029 and 002 and 4122'), ['4122'])
})

test('ignores a version segment and a number glued to a word', () => {
  // MUTATION: drop the leading/trailing char classes from NUM_RE → "v1807", "2.1807" and
  // "1807abc" all tokenise as the bare number.
  for (const s of ['v1807', '2.1807', '1807abc', '1.807']) {
    assert.deepEqual(nums(s), [], s)
  }
})

test('ignores digits inside a submodule pointer', () => {
  // NOT MUTATION-PINNED, and says so rather than pretending: deleting the "Subproject commit"
  // skip leaves this green. A real SHA is 40 unbroken hex characters, so every digit run in it is
  // already rejected by NUM_RE's own boundaries — preceded or followed by a hex letter. The skip
  // guards a FUTURE widening of that regex, not a currently reachable branch. Verified by
  // executing the deletion (test-writer, 2026-09-14). The test still documents the behaviour.
  assert.deepEqual(nums('Subproject commit 1807abc4122def0000111122223333444455556666'), [])
})

test('ignores a number below three digits', () => {
  // MUTATION: lower NUM_RE's {3,13} floor → two-digit numbers flood the candidate set, and
  // a needle that short makes the survivor grep match almost everything.
  assert.deepEqual(nums('a 30-second grace period and 99 items'), [])
})

// --------------------------------------------------------------- FILE tokenisation

test('tokenises a filename with a known extension', () => {
  // MUTATION: replace FILE_EXT's closed list with a generic [a-z]{1,5} pattern → "process.argv"
  // tokenises as a filename. That exact false positive appeared in the calibration run.
  assert.deepEqual(files('see check-file-size-guard.test.mjs for the pin'), [
    'check-file-size-guard.test.mjs',
  ])
  assert.deepEqual(files('process.argv holds the flags'), [])
})

test('does not split a .tsx filename into a .ts one', () => {
  // MUTATION: reorder FILE_EXT so "ts" precedes "tsx" AND remove FILE_RE's trailing
  // `(?![\w-])` lookahead — neither break alone reddens this test. With the lookahead intact,
  // ts-before-tsx ordering still lets the lookahead reject the short match and backtrack to
  // tsx. With longest-first ordering, removing the lookahead still keeps tsx winning. Only
  // both removed together shorten the match to .ts and invert the existence-tier verdict.
  assert.deepEqual(files('quiz-config-form.tsx renders it'), ['quiz-config-form.tsx'])
})

test('reduces a path to its basename and ignores a hostname', () => {
  // MUTATION: add "/" back to FILE_RE's lookbehind → "docs/plan.md" yields NO token at all, so
  // every filename written as a path becomes invisible to the guard.
  assert.deepEqual(files('cited in docs/plan.md today'), ['plan.md'])
  // A hostname is held out by the CLOSED extension list, not by the lookbehind — a dotted name
  // that does end in a source extension matches whole, which is correct, since that is also
  // what a real filename looks like.
  // MUTATION: widen FILE_EXT to a generic [a-z]{1,5} → every URL in the corpus becomes a claim.
  assert.deepEqual(files('hosted at www.example.com today'), [])
})

// ------------------------------------------------------------ the correction gate

const hunk = (rem, add) => ({ rem, add })

test('a hunk that only deletes yields no candidate', () => {
  // MUTATION: make candidatesFor return `[...remN]` unconditionally instead of gating on
  // `addN.length > 0` → a pure deletion is treated as a correction, and deduplicating prose then
  // blocks on every number it removes. That is the 18%-of-commits noise floor of the naive design.
  //
  // The gate is `addN.length > 0`, NOT a check on `hunk.add.length` — this comment named the
  // latter until CR caught it, which was a check deleted several commits earlier as redundant.
  // A comment naming a mechanism that no longer exists is the §7 defect in its purest form.
  assert.deepEqual(candidatesFor(hunk(['the count was 1807'], [])).nums, [])
})

test('a hunk that rewrites prose without a replacement value yields no candidate', () => {
  // MUTATION: weaken the gate to "the hunk has any added line" → a rewrite that merely drops a
  // number fires. Measured on docs/database.md: this is what separates a correction from a
  // rewrite, and removing it reintroduces the calibration's false positives.
  assert.deepEqual(
    candidatesFor(hunk(['limit was 4122 rows'], ['limit is enforced server-side'])).nums,
    [],
  )
})

test('a hunk swapping one value for another yields the old value', () => {
  // MUTATION: any break in candidatesFor's same-class replacement logic → the flagship
  // 1807→1806 swap stops being a candidate and the guard never fires on its own instance.
  assert.deepEqual(candidatesFor(hunk(['(1807 lines)'], ['(1806 lines)'])).nums, ['1807'])
})

test('a replacement that also appears on the removed lines does not satisfy the gate', () => {
  // MUTATION: drop the !remN.has(t) filter on addN → an unchanged neighbouring number counts
  // as the replacement, so every touched hunk satisfies the gate and the gate stops gating.
  assert.deepEqual(candidatesFor(hunk(['1807 of 900'], ['900 total'])).nums, [])
})

test('a filename swap carries its same-extension replacements', () => {
  // MUTATION: stop populating `replacements` → main() can no longer tell a genuine filename
  // swap from a citation being dropped, and the existence tier collapses.
  const out = candidatesFor(hunk(['see guard.test.mjs'], ['see guard.cli.test.mjs']))
  assert.deepEqual(
    out.files.map((f) => f.token),
    ['guard.test.mjs'],
  )
  assert.ok(out.files[0].replacements.includes('guard.cli.test.mjs'))
})

// ------------------------------------------------------------------ hunk parsing

test('parses removed and added lines per hunk', () => {
  // MUTATION: stop resetting on "@@" → every hunk in a file collapses into one, so a deletion
  // in one hunk is paired with an unrelated addition in another and the gate passes falsely.
  const hunks = parseHunks('@@ -1 +1 @@\n-old 1807\n+new 1806\n@@ -9 +9 @@\n-gone 4122\n')
  assert.equal(hunks.length, 2)
  assert.deepEqual(hunks[0].rem, ['old 1807'])
  assert.deepEqual(hunks[1].add, [])
})

test('strips a trailing carriage return from diff lines', () => {
  // MUTATION: delete the /\r$/ strip → under core.autocrlf the last token on a line carries
  // \r, the survivor grep needle never matches, and the guard passes on a live retraction.
  const hunks = parseHunks('@@ -1 +1 @@\r\n-was 1807\r\n+now 1806\r\n')
  assert.deepEqual(hunks[0].rem, ['was 1807'])
})

test('ignores the file header lines that precede the first hunk', () => {
  // MUTATION: start collecting before the first "@@" → the "--- a/path" header line is read as
  // a removed line and the path itself becomes a token.
  const hunks = parseHunks('diff --git a/x b/y\n--- a/x\n+++ b/y\n@@ -1 +1 @@\n-a 1807\n+b 1806\n')
  assert.deepEqual(hunks[0].rem, ['a 1807'])
})

test('aborts when a non-empty body yields no hunks', () => {
  // MUTATION: return [] instead of throwing → a diff the parser cannot read is indistinguishable
  // from a file that removed nothing, and the guard exits 0 having checked nothing.
  assert.throws(() => parseHunks('this is not a diff at all\nnor is this\n'), /no hunks/)
})

test('accepts a binary patch without aborting', () => {
  // MUTATION: delete the binary-marker recognition → every commit touching a binary file aborts
  // with exit 2, and the guard gets disabled to unblock work.
  assert.deepEqual(parseHunks('Binary files a/x.png and b/x.png differ\n'), [])
})

// ---------------------------------------------------------------------- waivers

const REASON = 'the fixture pins the pre-fix value deliberately'

test('accepts a waiver naming one token with a substantive reason', () => {
  // MUTATION: break TRAILER_RE → the only escape hatch stops working and the guard becomes
  // unusable on a legitimate exception, which is how a guard gets deleted.
  const { waivers, problems } = parseWaivers(`fix: x\n\nRetracted-ok: 1807 — ${REASON}\n`)
  assert.deepEqual(problems, [])
  assert.equal(waivers.get('1807'), REASON)
})

test('rejects a waiver whose reason asserts nothing', () => {
  // NOT independently pinned by either guard alone. All five fixtures are members of
  // EMPTY_REASONS AND have stripped length < 20, so each guard catches them independently.
  // Deleting only the length floor leaves EMPTY_REASONS to catch all five; deleting only
  // EMPTY_REASONS leaves the floor to catch all five. Only removing BOTH makes this test fail.
  // This test exercises EMPTY_REASONS values; for each guard pinned independently, see the
  // two tests that follow.
  for (const bad of ['false positive', 'noise', 'n/a', 'intentional', 'ok']) {
    const { waivers, problems } = parseWaivers(`fix: x\n\nRetracted-ok: 1807 — ${bad}\n`)
    assert.equal(waivers.size, 0, bad)
    assert.equal(problems.length, 1, bad)
  }
})

test('rejects a waiver reason that is too brief even if not a known empty phrase', () => {
  // MUTATION: delete `reason.replace(/\s/g, '').length < 20` from the condition → this
  // fixture is accepted because 'insufficient detail' is NOT in EMPTY_REASONS, so removing
  // the length floor is the only change that makes it pass. The five fixtures in the test
  // above are all caught by EMPTY_REASONS too, so the floor is never independently exercised
  // there; this fixture pins it in isolation.
  //   'insufficient detail' → replace(/\s/g,'').length = 18 (< 20: caught by length floor)
  //   bare = 'insufficient detail' → NOT in EMPTY_REASONS → floor is sole mechanism
  const { waivers, problems } = parseWaivers('fix: x\n\nRetracted-ok: 1807 — insufficient detail\n')
  assert.equal(waivers.size, 0)
  assert.equal(problems.length, 1)
})

test('rejects a waiver whose bare reason is in EMPTY_REASONS despite passing the length floor', () => {
  // MUTATION: delete EMPTY_REASONS from the condition → this fixture is accepted because it
  // has 21 non-whitespace chars (passes the length-floor check of < 20), yet its bare form
  // is "not applicable" — which is in EMPTY_REASONS. Without this test, removing EMPTY_REASONS
  // from the guard is invisible: the five fixtures in the test above are all caught by the
  // length floor before EMPTY_REASONS is ever consulted.
  //   'not applicable!!!!!!!!' → replace(/\s/g,'').length = 21 (>= 20: passes length floor)
  //   bare = 'not applicable' (punctuation stripped by [^a-z ]) → in EMPTY_REASONS → rejected
  const { waivers, problems } = parseWaivers(
    'fix: x\n\nRetracted-ok: 1807 — not applicable!!!!!!!!\n',
  )
  assert.equal(waivers.size, 0)
  assert.equal(problems.length, 1)
})

test('rejects a waiver with no token', () => {
  // MUTATION: make the token group optional → one bare marker waives every token in the commit.
  const { waivers } = parseWaivers(`fix: x\n\nRetracted-ok: — ${REASON}\n`)
  assert.equal(waivers.size, 0)
})

test('a waiver for one token does not waive another', () => {
  // MUTATION: key the waiver map on anything but the exact token → waiving one value silently
  // waives unrelated ones in the same commit.
  const { waivers } = parseWaivers(`fix: x\n\nRetracted-ok: 1807 — ${REASON}\n`)
  assert.ok(waivers.has('1807'))
  assert.ok(!waivers.has('1806'))
})

test('ignores prose that merely mentions the trailer name', () => {
  // MUTATION: match the trailer anywhere in a line rather than anchored at its start → a commit
  // message discussing the hatch accidentally invokes it.
  const { waivers } = parseWaivers(`fix: x\n\nWe considered a Retracted-ok: 1807 — ${REASON}\n`)
  assert.equal(waivers.size, 0)
})

// ------------------------------------------------------------------ reAdded

test('reAdded: a value token buried inside a longer number is not treated as re-added', () => {
  // MUTATION: change reAdded to use bare `line.includes(token)` instead of delegating to
  // tokensOf → '11807'.includes('1807') is true, so the retraction is falsely exonerated.
  // The repo test pins the same gap via the CLI; this unit test pins the mechanism directly.
  assert.equal(reAdded('1807', 'value', 'pool holds 11807 rows today'), false)
  assert.equal(reAdded('1807', 'value', 'count corrected to 1807 here'), true)
})

test('reAdded: a filename token matched as a suffix of a longer name is not re-added', () => {
  // MUTATION: change reAdded to use bare `line.includes(token)` instead of delegating to
  // tokensOf → 'check-foo.mjs'.includes('foo.mjs') is true, so a filename retraction is
  // falsely exonerated by a co-occurring longer name. FILE_RE's lookbehind excludes hyphens,
  // so 'check-foo.mjs' (hyphen before 'f') does not satisfy the boundary. The two repo tests
  // never exercise this path — both use numeric tokens.
  assert.equal(reAdded('foo.mjs', 'filename', 'check-foo.mjs is referenced here'), false)
  assert.equal(reAdded('foo.mjs', 'filename', 'foo.mjs is referenced here'), true)
})

test('reAdded: a dot inside a filename token is treated as a literal character, not a wildcard', () => {
  // MUTATION: match via `new RegExp('(?<![\\w.@-])(' + token + ')(?![\\w-])')` (boundaries kept
  // but no escaping) instead of delegating to tokensOf → the dot in 'plan.md' becomes a regex
  // wildcard; 'planXmd' satisfies the boundary pattern and the retraction is falsely exonerated.
  // This break reddens only this test (the boundary-keeping prevents the FIX 4 tests from also
  // failing). reAdded delegates to tokensOf, which uses FILE_RE — a regex that escapes the dot
  // to `\.` — and then compares by string equality, so no unescaped regex is built from the token.
  assert.equal(reAdded('plan.md', 'filename', 'the doc planXmd is linked here'), false)
  assert.equal(reAdded('plan.md', 'filename', 'the doc plan.md is linked here'), true)
})
