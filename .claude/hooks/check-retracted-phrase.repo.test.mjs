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
//   - the `token.length < 3` assertion in survivors(). Unreachable today: NUM_RE requires
//     three digits and FILE_RE an extension, so no shorter token can be produced. Kept as an
//     invariant in case either regex is widened, not as a live branch.
//   - the `err.status === 1 && !err.signal` discrimination on `git grep`. Forcing a non-1
//     grep failure from a fixture is not something this harness can do reliably.
//
// The latin1 decode of git's `-z` output USED to be listed here, on the grounds that a fixture
// could not create a genuinely invalid-byte filename. That was wrong about the reason: the old
// fixture built its names as latin1 STRINGS, and Node re-encodes a string path to UTF-8 on the
// way to the syscall. A BUFFER path does not, and the decode is now pinned in
// check-retracted-phrase.paths.test.mjs. An "untestable" claim is worth re-examining.
// Do not delete any mechanism listed above on the grounds that "no test covers them" — that is
// exactly backwards.

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { run, seedFlagship, withRepo } from './check-retracted-phrase.testkit.mjs'

// CONTROL: red
// GROUP: hunksfor-paths-through-argv, check-retracted-phrase-always-passes
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

// CONTROL: green
// GROUP: rarity-floor-zero, check-retracted-phrase-always-blocks
test('passes once the correction is finished everywhere', () => {
  // MUTATION: make the rarity floor 0 instead of 1 → a fully completed correction blocks its
  // own commit, and the guard becomes impossible to satisfy.
  //
  // The out-of-corpus row below carries the CORRECTED value deliberately. Sharing the flagship's
  // stale row would make this fixture identical to the flagship's own, and BOTH would then
  // redden on either mutation — neither pinning its own claim (CR, PR #1274).
  withRepo((r) => {
    seedFlagship(r)
    r.write('apps/web/lib/notes.md', '| drift | types.ts cited as "1806-line" - correct |\n')
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

// GROUP: waiver-break-trailer-re, waiver-key-not-exact-token
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

// GROUP: waiver-any-trailer-clears
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

// GROUP: grepscope-drop-cached
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

// GROUP: raw-rename-consumes-one-path
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

// GROUP: rarity-ceiling-removed
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

// GROUP: corpus-widened-to-app-code
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

// GROUP: drop-readded-exoneration
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

// GROUP: readded-substring-numeric
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

// GROUP: addedtext-include-memory
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

// GROUP: fold-could-not-run-into-finding
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
  // NOT MUTATION-PINNED, and says so: removing the explicit EMPTY_TREE argument changes nothing
  // observable here, because `git diff --cached` already treats an unborn HEAD as the empty tree.
  // A first commit is also all additions, so the hunk gate yields no candidate either way. This
  // case documents that the guard RUNS on a fresh repo rather than aborting; the EMPTY_TREE
  // fallback is belt-and-braces against a git that stops being so forgiving. (CodeRabbit.)
  withRepo((r) => {
    r.write('docs/a.md', 'the value is 1807 here\n')
    r.git('add', '-A')
    assert.equal(run(r, 'feat: first commit\n').status, 0)
  })
})

// GROUP: incorpus-drop-exact-root
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

// GROUP: drop-completed-spec-exclusion
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

// GROUP: survivors-bare-substring-pattern
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

// GROUP: survivors-bare-substring-pattern
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

// GROUP: survivors-drop-escapere
test('a dot in a filename token is treated as a literal character, not a wildcard, by the survivor grep', () => {
  // MUTATION: drop escapeRe from survivors() — token used as the raw PCRE body.
  // The dot in 'plan.md' becomes a wildcard; 'plan_md' (boundary-passing, no literal dot)
  // matches and counts as a surviving occurrence, blocking a finished retraction.
  // This mirrors the reAdded() escaping test in check-retracted-phrase.test.mjs.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "consult plan.md for the schema" }\n')
    r.write('docs/other.md', 'the generated file plan_md is at a different path\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "consult schema.md for the schema" }\n')
    r.git('add', '-A')
    assert.equal(
      run(r, 'fix: use the renamed reference\n').status,
      0,
      'plan_md is not an occurrence of plan.md — the dot must be escaped',
    )
  })
})

// GROUP: drop-gitlink-skip
test('a submodule pointer does not abort the run', () => {
  // MUTATION: drop the GITLINK_MODE skip in hunksFor → a submodule is a gitlink whose "blob" SHA
  // is a COMMIT, `git cat-file blob` fails on it, and the guard aborts at exit 2 — blocking every
  // commit that touches a submodule. Exit 2 is the could-not-run code, so the author is told the
  // check broke rather than that their commit is wrong, with no waiver available.
  withRepo((r) => {
    seedFlagship(r)
    // A real gitlink entry, added the way git itself records one.
    const sha = r.git('rev-parse', 'HEAD').trim()
    r.git('update-index', '--add', '--cacheinfo', `160000,${sha},vendor/dep`)
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '.claude/limits.json')
    const { status, stderr } = run(r, 'fix: correct the count beside a submodule\n')
    assert.equal(status, 1, 'the retraction is still graded; the submodule is simply skipped')
    assert.match(stderr, /retracted the value `1807`/)
  })
})

// GROUP: survivors-bare-substring-pattern, survivors-drop-skip-fail-alternation
test('a ticket reference elsewhere does not exonerate or survive a retraction', () => {
  // MUTATION: give reAdded its own boundary regex instead of delegating to tokensOf, or drop the
  // (*SKIP)(*FAIL) alternation from the survivor pattern → `PR 1807` counts as a re-add or as a
  // surviving occurrence of 1807, even though tokensOf refuses to treat it as a claim at all.
  // Three code paths decide what a token IS; any one of them disagreeing is a defect, and this
  // pair disagreed until CodeRabbit measured it.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "types.ts is GENERATED (1807 lines)" }\n')
    r.write('docs/tickets.md', 'tracked in PR 1807 and issue 1807\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/limits.json', '{ "note": "types.ts is GENERATED (1806 lines)" }\n')
    r.write('docs/more-tickets.md', 'follow-up in PR 1807\n')
    r.git('add', '-A')
    assert.equal(
      run(r, 'fix: correct the count\n').status,
      0,
      'ticket references are neither survivors nor re-adds',
    )
  })
})
