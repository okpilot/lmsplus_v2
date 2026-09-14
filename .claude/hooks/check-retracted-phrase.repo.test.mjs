// Run: node --test .claude/hooks/check-retracted-phrase.repo.test.mjs
//
// Git-facing behaviour of the retracted-phrase guard, driven through the CLI against
// throwaway repositories. The pure decision logic is pinned in
// check-retracted-phrase.test.mjs; these cases exist because the fail-open classes this
// guard inherits (index-vs-worktree, byte-unsafe paths, a grep exit code read as "no
// match") are ONLY reachable through a real git process.
//
// Every case below is MUTATION-PINNED: the opening comment names the break that turns it red,
// and each was verified by making that break against a scratch copy and watching the suite go
// red. Re-run that check with `--update`-style edits to a copy, never to the tracked file.
//
// Some mechanisms in the guard are NOT pinned. They are NAMED rather than counted — a count
// here goes stale the moment one is added or closed, and this list has already grown once:
//   1. the latin1 decode of git's -z output. A fixture cannot create a genuinely invalid-byte
//      filename through Node's string path API — the byte is re-encoded to valid UTF-8 on the
//      way to the filesystem — so both decodes behave identically under test. It is
//      defence-in-depth: paths reach git only as blob SHAs, so a consistent mangling is
//      harmless, and only a COLLISION between two distinct paths could cause a miss.
//   2. the `token.length < 3` assertion in survivors(). Unreachable today: NUM_RE requires
//      three digits and FILE_RE an extension, so no shorter token can be produced. Kept as an
//      invariant in case either regex is widened, not as a live branch.
//   3. the `err.status === 1 && !err.signal` discrimination on `git grep`. Forcing a non-1
//      grep failure from a fixture is not something this harness can do reliably.
// Do not delete any mechanism listed above on the grounds that "no test covers them" — that is
// exactly backwards.

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { run, seedFlagship, withRepo } from './check-retracted-phrase.testkit.mjs'

test('blocks when a corrected value still stands in another corpus file', () => {
  // MUTATION: break any link in the chain — the diff read, the hunk gate, the survivor grep,
  // the rarity window — and the instance this guard exists for stops firing. This is the
  // acceptance test: a guard that misses its own motivating case is not done.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the generated line count\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
    assert.match(stderr, /check-file-size-guard\.test\.mjs/)
  })
})

test('passes once the correction is finished everywhere', () => {
  // MUTATION: make the rarity floor 0 instead of 1 → a fully completed correction blocks its
  // own commit, and the guard becomes impossible to satisfy.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.write(
      '.claude/hooks/check-file-size-guard.test.mjs',
      '// a 1806-line GENERATED file is reported\n',
    )
    r.git('add', '-A')
    assert.equal(run(r, 'fix: correct the count everywhere\n').status, 0)
  })
})

test('does not count an agent-memory file as a surviving occurrence', () => {
  // MUTATION: drop the agent-memory exclusion from the survivor pathspec → a tracker row
  // quoting the old claim counts as a survivor, so every corrected claim blocks forever and
  // the guard is disabled within a week.
  withRepo((r) => {
    seedFlagship(r)
    // Leave ONLY the memory file holding the old value.
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.write(
      '.claude/hooks/check-file-size-guard.test.mjs',
      '// a 1806-line GENERATED file is reported\n',
    )
    r.git('add', '-A')
    assert.equal(run(r, 'fix: correct the count\n').status, 0)
  })
})

test('an agent-memory file quoting the old value does not exonerate the retraction', () => {
  // The memory exclusion has TWO halves and they fail differently. The test above pins the
  // SURVIVOR half; this pins the re-added half.
  // MUTATION: include .claude/agent-memory/** when building addedText → a tracker row recording
  // "the claim used to say 1807" is read as the token being re-added, the retraction is
  // exonerated, and the real survivor is never reported. Every post-commit cycle writes such a
  // row, so this would silently disable the guard on precisely the commits it exists for.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.write(
      '.claude/agent-memory/learner/MEMORY.md',
      '| row | the note previously claimed 1807 lines |\n',
    )
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the count and record it\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('a valid waiver trailer permits the commit', () => {
  // MUTATION: stop consulting the waiver map in main() → the only escape hatch is inert, and a
  // legitimate exception can be cleared only by deleting the guard.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    const msg =
      'fix: correct the count\n\nRetracted-ok: 1807 — the guard fixture pins the pre-fix value on purpose\n'
    assert.equal(run(r, msg).status, 0)
  })
})

test('a waiver naming a different token does not clear the finding', () => {
  // MUTATION: waive by presence of ANY trailer rather than by exact token → one waiver clears
  // every finding in the commit, which is the wildcard the hatch must never become.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    const msg =
      'fix: correct the count\n\nRetracted-ok: 9999 — an unrelated token waived deliberately here\n'
    assert.equal(run(r, msg).status, 1)
  })
})

test('grades the INDEX, not the working tree', () => {
  // MUTATION: drop --cached from the survivor grep → git commits the index but the guard reads
  // the worktree. Here the survivor is deleted on disk yet still staged, so a worktree read
  // reports "no survivors" and the guard passes on a live retraction (fail-OPEN).
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    // Remove the survivor from the WORKTREE only — the index still carries it.
    writeFileSync(join(r.dir, '.claude/hooks/check-file-size-guard.test.mjs'), '// nothing here\n')
    const { status, stderr } = run(r, 'fix: correct the count\n')
    assert.equal(status, 1)
    assert.match(stderr, /1807/)
  })
})

test('a near-identical sibling path is not mistaken for the edited file', () => {
  // MUTATION: compare paths loosely in survivors() — a normalised form, a `String.includes`, or
  // a basename match instead of exact equality → the sibling is dropped as "self", the only
  // survivor disappears, and the guard exits 0 on a live retraction (fail-OPEN). That is the
  // shape of the `./`-prefix hole already recorded against check-file-size-guard.mjs.
  //
  // This does NOT pin the latin1 decode, despite the byte-level fixture: Node's string path API
  // re-encodes these names to VALID UTF-8 on the way to the filesystem (0xFE becomes C3 BE), so
  // both decodes keep the two paths distinct and the mutation is unobservable here. See the
  // preamble, which lists that decode among the mechanisms it records as unpinned.
  withRepo((r) => {
    const odd = (b) =>
      Buffer.concat([Buffer.from('docs/we'), Buffer.from([b]), Buffer.from('rd.md')]).toString(
        'latin1',
      )
    const [a, b] = [odd(0xfe), odd(0xff)]
    for (const p of [a, b]) r.write(p, 'the count is 1807 here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'two odd paths')
    r.write(a, 'the count is 1806 here\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct one of them\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('grades a path holding a non-UTF-8 byte', () => {
  // MUTATION: pass paths to git through argv rather than diffing blob SHAs → Node re-encodes
  // the argument as UTF-8, git is handed a name that matches nothing, and the file is never
  // graded while the guard still exits 0.
  withRepo((r) => {
    seedFlagship(r)
    const odd = Buffer.concat([Buffer.from('docs/we'), Buffer.from([0xff]), Buffer.from('ird.md')])
    const p = join(r.dir, odd.toString('latin1'))
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, 'the count is 1807 here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'add odd path')
    writeFileSync(p, 'the count is 1806 here\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the count\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('a rename in the same commit does not desync the path stream', () => {
  // An R record carries TWO paths where every other status carries one.
  // MUTATION: consume one path on R instead of two → the NUL stream shifts by one, every
  // later entry is graded under the WRONG path, and the real correction below goes unreported
  // while the guard still exits 0. Switching --raw for --name-only breaks it the other way:
  // only the rename's DESTINATION is printed and the source is never read at all.
  withRepo((r) => {
    seedFlagship(r)
    r.write('docs/moved.md', 'some stable prose that will simply be renamed\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'add a file to rename')
    r.git('mv', 'docs/moved.md', 'docs/moved-elsewhere.md') // content untouched → a clean R100
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: rename one file and correct another\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('a token surviving in three or more files is common vocabulary, not a claim', () => {
  // MUTATION: raise or remove the rarity ceiling → the naive detector's 18%-of-commits noise
  // floor returns, which is what made the first design unshippable.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "the value 1807 appears here" }\n')
    for (const n of ['a', 'b', 'c']) r.write(`docs/${n}.md`, 'the value 1807 appears here too\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "the value 1806 appears here" }\n')
    r.git('add', '-A')
    assert.equal(run(r, 'fix: correct one copy\n').status, 0)
  })
})

test('application code is out of scope on both sides', () => {
  // MUTATION: widen CORPUS to the whole repo → every app-code hit from the calibration returns.
  // This programme governs rule and doc prose; source comments are a different detector's job.
  withRepo((r) => {
    r.write('apps/web/a.ts', '// the limit is 1807 rows\n')
    r.write('apps/web/b.ts', '// the limit is 1807 rows\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('apps/web/a.ts', '// the limit is 1806 rows\n')
    r.git('add', '-A')
    assert.equal(run(r, 'fix: correct one\n').status, 0)
  })
})

test('a token re-added elsewhere in the same commit was reworded, not retracted', () => {
  // MUTATION: delete the addedText re-appearance check → moving a claim between corpus files
  // blocks, so any reflow or relocation of prose fails the gate.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.write('docs/plan.md', 'the generated file is 1807 lines, recorded here now\n')
    r.git('add', '-A')
    assert.equal(run(r, 'fix: move the note\n').status, 0)
  })
})

test('a LONGER number containing the token does not exonerate the retraction', () => {
  // MUTATION: swap reAdded() back for a bare `addedText.includes(c.token)` → `'11807'` contains
  // `'1807'`, the retraction is exonerated, and the surviving copy is never reported (fail-OPEN).
  // `'1807'` contains `'807'` the same way, so the three-digit class breaks identically.
  // The boundary rules live in NUM_RE, but those run when TOKENISING — the re-added check has to
  // re-apply them itself, and for a year it did not.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    // A co-occurring, entirely unrelated number that merely CONTAINS the retracted one.
    r.write('docs/plan.md', 'unrelated: the pool holds 11807 rows today\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the count, mention an unrelated total\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('a token re-added only in application code does not exonerate a corpus retraction', () => {
  // MUTATION: accumulate addedText from every non-memory entry instead of corpus entries only →
  // a value moved OUT of the documented corpus into source exonerates a corpus retraction that
  // is still incomplete. The survivor search is corpus-scoped, so the re-added check must be too,
  // or the two halves disagree about what "the documented set" means.
  withRepo((r) => {
    seedFlagship(r)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.write('apps/web/generated-note.ts', '// the generated file is 1807 lines\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: move the note into source\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
  })
})

test('reports a usage error as could-not-run, never as a finding', () => {
  // MUTATION: fold exit 2 into exit 1 → an environmental failure is indistinguishable from a
  // real finding, and the cheapest way to clear it is a permanent waiver that masks the
  // breakage forever. The message must also steer away from that remedy.
  withRepo((r) => {
    seedFlagship(r)
    const missing = run(r, null, ['--base'])
    assert.equal(missing.status, 2)
    const bogus = run(r, null, ['--base', 'no-such-ref-at-all'])
    assert.equal(bogus.status, 2)
    assert.match(bogus.stderr, /could not run|BLOCKING/)
    assert.match(bogus.stderr, /Do NOT write a Retracted-ok trailer/)
  })
})

test('runs on a repository with no commits yet', () => {
  // MUTATION: catch the missing-HEAD case and exit 0 instead of diffing the empty tree → the
  // guard is silently disabled on the first commit of every new worktree.
  withRepo((r) => {
    r.write('docs/a.md', 'the value is 1807 here\n')
    r.git('add', '-A')
    assert.equal(run(r, 'feat: first commit\n').status, 0)
  })
})

test('CLAUDE.md counts as a surviving corpus file (exact-match root entry)', () => {
  // MUTATION: drop `path === root` from inCorpus → CLAUDE.md and .coderabbit.yaml are never
  // matched (both are non-directory CORPUS entries that require exact equality, not a prefix).
  // A retraction whose only survivor lives in CLAUDE.md exits 0 instead of 1 — fail-OPEN.
  // No existing test catches this: every other fixture uses survivors inside .claude/ or docs/,
  // which match the prefix branch and are unaffected by this change.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "value": "1807" }\n')
    r.write('CLAUDE.md', '# guide\n\nthe limit is 1807 rows\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "value": "1806" }\n')
    r.git('add', '-A')
    const { status, stderr } = run(r, 'fix: correct the value\n')
    assert.equal(status, 1, 'CLAUDE.md must be counted as a corpus survivor')
    assert.match(stderr, /1807/)
  })
})

test('a completed spec is not a surviving occurrence, a live one is', () => {
  // MUTATION: invert or delete the completed-spec derivation → either a historical record
  // blocks corrections forever, or a live spec silently stops being watched. The split is
  // agent-workflow.md § Rule-Mirror Sync's, not this guard's invention.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807" }\n')
    r.write('.spec-workflow/specs/done/tasks.md', '- [x] finished\nthe value 1807 was used\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "value 1806" }\n')
    r.git('add', '-A')
    assert.equal(run(r, 'fix: correct it\n').status, 0, 'completed spec must not count')

    // Reopen the spec, and make it carry the value the NEXT correction retracts.
    r.write('.spec-workflow/specs/done/tasks.md', '- [ ] still open\nthe value 1806 was used\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'reopen')
    r.write('.claude/limits.json', '{ "note": "value 1805" }\n')
    r.git('add', '-A')
    assert.equal(run(r, 'fix: correct it again\n').status, 1, 'live spec must count')
  })
})

test('a longer number elsewhere is not counted as a surviving occurrence', () => {
  // MUTATION: swap the survivor grep's `-P` + boundary pattern back for a bare `-F` + token →
  // `grep -F` is a SUBSTRING match, so the unrelated `11807` below counts as a survivor of
  // `1807` and this COMPLETE retraction is blocked. Fail-CLOSED rather than open, but with no
  // honest remedy: the only way past is a waiver asserting a claim that was never stale.
  //
  // This is the mirror of the `reAdded` boundary bug. Both halves must agree on what "the same
  // token" means; fixing one and not the other is how they drifted apart in the first place.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "types.ts is GENERATED (1807 lines)" }\n')
    r.write('docs/unrelated.md', 'a different measurement entirely: 11807 rows\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "types.ts is GENERATED (1806 lines)" }\n')
    r.git('add', '-A')
    assert.equal(run(r, 'fix: correct the count\n').status, 0, '11807 is not an occurrence of 1807')
  })
})

test('a longer filename elsewhere is not counted as a surviving occurrence', () => {
  // MUTATION: as above, for the filename class — `my-plan.md` contains `plan.md`, so a bare `-F`
  // reports it and blocks a finished rename. The two token classes carry DIFFERENT boundary
  // rules, so a fix applied to only one of them leaves this half broken.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "see plan.md and also guard.test.mjs" }\n')
    r.write('docs/other.md', 'refers to my-plan.md, a different file\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "see roadmap.md and also guard.test.mjs" }\n')
    r.git('add', '-A')
    assert.equal(
      run(r, 'fix: repoint the citation\n').status,
      0,
      'my-plan.md is not an occurrence of plan.md',
    )
  })
})
