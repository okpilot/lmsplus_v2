// Run: node --test .claude/hooks/check-prose-paths.repo.test.mjs
//
// The git-facing and subprocess paths of the prose-paths guard: corpus scoping, the baseline
// ratchet, the staged/index read, the gitignore round trip and the exit-code split. The pure
// decision logic lives in check-prose-paths.test.mjs, so neither file approaches the
// test-file cap in .claude/limits.json.
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns it red, and
// every break was EXECUTED before being written down (`code-style.md` §7 — a `MUTATION:` line
// is a prose claim). Some breaks redden a GROUP of cases rather than one; those carry a
// `GROUP:` marker naming the mutation id. The EXACT set each break reddens is DATA, in
// check-prose-paths.mutations.json, and `node .claude/hooks/run-mutations.mjs --guard
// check-prose-paths` re-derives it — do not hand-maintain a second copy here.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildIndex, evaluate } from './check-prose-paths.mjs'
import { runNode } from './spawn.testkit.mjs'

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-prose-paths.mjs')

/** A citation of a file that is not there. `docs/` is a real top-level entry in every fixture. */
const DEAD = 'see docs/gone.md for the full list'

/** A throwaway repo, removed however the body exits. */
function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'prose-paths-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    git('init', '-q', '.')
    git('config', 'user.email', 't@example.com')
    git('config', 'user.name', 'Test')
    // Isolate from the RUNNER's global git config: a global `commit.gpgsign=true` makes every
    // fixture commit demand a signing key, and a global `core.hooksPath` runs someone else's
    // hooks inside these throwaway repos. Either way the suite fails on a machine, not on a
    // defect, and the failure looks like a guard bug.
    git('config', 'commit.gpgsign', 'false')
    git('config', 'core.hooksPath', join(dir, '.git', 'no-hooks'))
    const write = (rel, body) => {
      mkdirSync(join(dir, dirname(rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    write('.claude/prose-paths.json', JSON.stringify({ claims: {} }))
    return fn({ dir, git, write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Run the guard in `dir`. `runNode`, not `execFileSync`: the latter surfaces stderr only on
 * the THROWING path, so a case asserting on the diagnostics of a SUCCESSFUL run (every
 * `--update-baseline` case) would compare against an empty string and pass vacuously in one
 * direction.
 */
function run({ dir }, args = []) {
  const { status, stderr, stdout } = runNode('check-prose-paths', [GUARD, ...args], { cwd: dir })
  return { status, stderr, stdout }
}

/** Baseline the whole corpus. */
function baseline({ dir }) {
  const r = run({ dir }, ['--update-baseline'])
  if (r.status !== 0) throw new Error(`baseline: exited ${r.status} — ${r.stderr}`)
}

// ---------------------------------------------------------------- enforcement

// CONTROL: red
// GROUP: check-prose-paths-always-passes
test('blocks a commit that stages a citation of a file that is not there', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', `intro\n${DEAD}\n`)
    r.git('add', '-A')
    // MUTATION: filter `fresh` to `baseline[key] !== undefined` → a finding absent from the
    // baseline stops being a finding, and the guard reports clean on everything forever.
    const res = run(r)
    // GROUP: new-findings-never-block
    assert.equal(res.status, 1)
    assert.match(res.stderr, /docs\/a\.md:2 {2}docs\/gone\.md/)
    assert.match(res.stderr, /does not/)
  }))

// CONTROL: green
// GROUP: check-prose-paths-always-blocks
test('does not block a citation already carried by the baseline', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${DEAD}\n`)
    r.git('add', '-A')
    baseline(r)
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', `${DEAD}\nan unrelated edit\n`)
    r.git('add', '-A')
    // MUTATION: drop the `baseline[key] === undefined` test from `fresh` → every
    // grandfathered citation blocks every commit that touches its file, and the ratchet
    // becomes a gate nobody can pass.
    assert.equal(run(r).status, 0)
  }))

// GROUP: scope-ignored, new-findings-never-block, enforcement-run-writes-the-baseline
test('scopes a finding to the staged files, but --all grades the whole worktree', () =>
  withRepo((r) => {
    r.write('docs/untouched.md', `${DEAD}\n`)
    r.write('docs/b.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/b.md', 'intro\nedit\n')
    r.git('add', '-A')
    // MUTATION: make `inScope` return true unconditionally → introducing the guard blocks
    // every commit in the repo until the whole corpus is clean, which is why the baseline
    // exists at all. The `--all` half is what proves the finding was really there.
    assert.equal(
      run(r).status,
      0,
      'pre-commit: the dead path is in a file this commit did not touch',
    )
    assert.equal(run(r, ['--all']).status, 1, 'CI: the whole worktree is graded')
  }))

// GROUP: stale-rows-never-reported, stale-term-dropped-from-early-return
test('reports a stale baseline row even when its file is not staged', () =>
  withRepo((r) => {
    r.write('docs/untouched.md', `${DEAD}\n`)
    r.write('docs/b.md', 'intro\n')
    r.git('add', '-A')
    baseline(r)
    r.git('commit', '-qm', 'init')
    r.write('docs/untouched.md', 'the list moved into the spec\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fix the citation')
    r.write('docs/b.md', 'intro\nedit\n')
    r.git('add', '-A')
    // MUTATION: drop the `stale.length > 0` term from the early-return condition → a citation
    // that is corrected or deleted leaves its baseline row behind forever, and the shrink-only
    // half of the ratchet stops existing. Stale rows are deliberately NOT scoped to the staged
    // set: the row is a property of the data file, so this commit must report it.
    const res = run(r)
    // GROUP: stale-rows-never-reported
    assert.equal(res.status, 1)
    assert.match(res.stderr, /describe no live finding/)
    assert.match(res.stderr, /docs\/untouched\.md@/)
  }))

// GROUP: staged-mode-reads-the-worktree, new-findings-never-block
test('grades the INDEX, not the working tree', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', `intro\n${DEAD}\n`)
    r.git('add', '-A')
    r.write('docs/a.md', 'intro\n') // worktree cleaned up, index still carries the citation
    // MUTATION: make `read` use readFileSync in staged mode → the guard grades bytes git is
    // not committing, and a dead citation staged then reverted in the worktree ships clean.
    // GROUP: new-findings-never-block
    assert.equal(run(r).status, 1)
  }))

test('accepts a path that is present on disk but untracked', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/notes.md', 'untracked, but it IS there\n')
    r.write('docs/a.md', 'intro\nsee docs/notes.md for the notes\n')
    r.git('add', 'docs/a.md')
    // MUTATION: make `resolves` return false instead of `existsSync(t)` → the guard asserts a
    // file is absent while it is sitting on disk, which is a false claim made to enforce a
    // rule about accuracy. Resolution is deliberately the weaker "on disk" test.
    assert.equal(run(r).status, 0)
  }))

// ---------------------------------------------------------------- corpus scoping

test('ignores a citation outside the corpus roots', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('apps/web/lib/notes.md', `| row | ${DEAD} |\n`)
    r.git('add', '-A')
    // MUTATION: drop the `if (!inCorpus(path)) return false` test from inPathCorpus → the run
    // log and every file outside the corpus roots are graded, so a note QUOTING a path that has
    // since gone becomes a blocking offence.
    assert.equal(run(r).status, 0)
  }))

// GROUP: spec-tree-not-excluded, new-findings-never-block
test('ignores a citation in a spec but grades one in steering', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.spec-workflow/specs/x/design.md', `${DEAD}\n`)
    r.write('.spec-workflow/steering/tech.md', `${DEAD}\n`)
    r.git('add', '-A')
    // MUTATION: delete the SPEC_PREFIX test in inPathCorpus → a spec, whose job is naming
    // files before they exist, blocks the commit alongside steering. Steering must still be
    // graded, which is the other half of this case.
    const res = run(r)
    // GROUP: new-findings-never-block
    assert.equal(res.status, 1)
    assert.match(res.stderr, /steering\/tech\.md/)
    assert.doesNotMatch(res.stderr, /specs\/x\/design\.md/)
  }))

// GROUP: gitignored-class-removed, check-ignore-output-discarded
test('ignores a gitignored artifact', () =>
  withRepo((r) => {
    r.write('.gitignore', 'build/\n')
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', 'intro\nthe bundle lands at build/out.js\n')
    r.git('add', '-A')
    // MUTATION: return an empty Set instead of reading `git check-ignore`'s output → every
    // generated artifact named in prose is reported, and the remedy is a waiver on each one.
    // This case is the one that exercises the real batched round trip.
    assert.equal(run(r).status, 0)
  }))

const NOTES = ['.spec-workflow/specs/gone/tasks.md', '.work/notes.md', 'docs/HANDOVER.md']

// GROUP: untracked-notes-exempted, handover-not-a-note, untracked-note-resolves-on-disk, new-findings-never-block, check-prose-paths-always-passes, spec-prefix-untracked-note-dropped, work-prefix-untracked-note-dropped
test('blocks a citation into a gitignored notes tree, even of a note on local disk', () =>
  withRepo((r) => {
    r.write('.gitignore', '.work/\n.spec-workflow/specs/*\nHANDOVER.md\n')
    r.write('.work/notes.md', 'local only\n')
    r.write('docs/a.md', `intro\nsee ${NOTES.join('\nsee ')}\n`)
    r.git('add', '-A')
    // MUTATION: drop inNoteTree from classify or resolves, or its HANDOVER.md clause → a note
    // citation passes. One citation per line: a finding echoes its line.
    const res = run(r)
    assert.equal(res.status, 1)
    for (const p of NOTES) assert.ok(res.stderr.includes(p), p)
  }))

// ---------------------------------------------------------------- fail closed

test('exits 2, not 1, when the baseline cannot be read at all', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${DEAD}\n`)
    r.git('add', '-A')
    rmSync(join(r.dir, '.claude/prose-paths.json'))
    mkdirSync(join(r.dir, '.claude/prose-paths.json'))
    // MUTATION: swallow the non-ENOENT error in readBaseline (return `{}`), or return 1 rather
    // than 2 from the CLI catch → "could not run" becomes indistinguishable from a finding,
    // and the cheapest remedy for a broken invocation is a permanent waiver.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /could not run — BLOCKING/)
    assert.match(res.stderr, /Do NOT write a prose-path-ok waiver/)
  }))

test('exits 2 when the baseline is malformed', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${DEAD}\n`)
    r.write('.claude/prose-paths.json', '{ "claims": [] }')
    r.git('add', '-A')
    // MUTATION: accept a non-object `claims` in readBaseline → an array baseline reads as
    // empty, every grandfathered citation becomes a finding, and the diagnostic blames the
    // prose rather than the data file.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /`claims` must be an object/)
  }))

// GROUP: absent-baseline-rethrown, new-findings-never-block
test('treats an absent baseline as empty and blocks, rather than passing', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${DEAD}\n`)
    rmSync(join(r.dir, '.claude/prose-paths.json'))
    r.git('add', '-A')
    // MUTATION: rethrow ENOENT in readBaseline, or return the live finding set from it → the
    // first-run case either aborts at exit 2 with no remedy, or passes clean. The direction
    // that fails CLOSED is to treat it as empty, so every citation is a visible finding.
    // GROUP: new-findings-never-block
    assert.equal(run(r).status, 1)
  }))

// ---------------------------------------------------------------- the ratchet is visible

// GROUP: enforcement-run-writes-the-baseline, new-findings-never-block
test('never rewrites the baseline from an enforcement run', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    baseline(r)
    r.git('commit', '-qm', 'init')
    const before = readFileSync(join(r.dir, '.claude/prose-paths.json'), 'utf8')
    r.write('docs/a.md', `intro\n${DEAD}\n`)
    r.git('add', '-A')
    // MUTATION: call updateBaseline from the enforcement path → the guard launders its own
    // finding into a clean run and the baseline grows with nothing in the diff to review.
    // GROUP: new-findings-never-block
    assert.equal(run(r).status, 1)
    assert.equal(readFileSync(join(r.dir, '.claude/prose-paths.json'), 'utf8'), before)
  }))

test('--update-baseline prints every added row before writing', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${DEAD}\n`)
    r.git('add', '-A')
    // MUTATION: drop the `+` loop in updateBaseline → rows are added with no diagnostic, so a
    // reviewer sees only a JSON diff and has nothing telling them a citation of an absent file
    // was grandfathered and needs an argument.
    const res = run(r, ['--update-baseline'])
    assert.equal(res.status, 0)
    assert.match(res.stderr, /\+ docs\/a\.md@/)
    assert.match(res.stderr, /REVIEW THE DIFF/)
  }))

test('--update-baseline refuses to write when any file could not be graded', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${DEAD} <!-- prose-path-ok: ok -->\n`)
    r.git('add', '-A')
    // MUTATION: drop the `problems.length > 0` guard in the --update-baseline branch → a
    // baseline written from a partial read records the corpus as smaller than it is, and every
    // citation in the unread file is invisible from then on.
    const res = run(r, ['--update-baseline'])
    // GROUP: unusable-waiver-not-reported, waiver-never-recognised, waiver-reason-floor-removed
    assert.equal(res.status, 2)
    // The fixture feeds an UNUSABLE WAIVER, not an unreadable file — assert the cause the
    // guard actually reports, so a message that named only the other one would redden here.
    assert.match(res.stderr, /an unreadable file or an unusable waiver/)
    assert.match(res.stderr, /the reason must state WHY/)
  }))

test('a directory-only gitignore pattern excuses the path even when the directory is absent', () =>
  withRepo((r) => {
    // NON-VACUITY, asserted first: with no .gitignore the SAME line IS a finding, so the token
    // really does reach the ignore check. A one-segment token like `build/` would be dropped by
    // an earlier narrowing and make the second half pass for an unrelated reason.
    r.write('docs/a.md', 'output lands in `apps/build/` and is not tracked\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'fixture')
    assert.equal(run(r, ['--all']).status, 1)

    // The guard strips the fixture token's trailing slash, and a DIRECTORY-ONLY pattern matches a
    // slash-less path only while the directory EXISTS — that is the only way git can tell it is a
    // directory. This fixture deliberately never creates that directory, so on disk it is exactly
    // a clean CI checkout, where the old single-spelling query reported the line as a dead path.
    //
    // MUTATION: drop the `${t}/` term from the flatMap in ignoredTokens → check-ignore is asked
    // only about `apps/build`, nothing matches a directory-only pattern with no directory present,
    // the token classifies `unresolved` instead of `gitignored-artifact`, and the second
    // assertion reddens on the status (1, not 0). Verified by execution.
    r.write('.gitignore', '/apps/build/\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'ignore')
    const res = run(r, ['--all'])
    assert.equal(res.status, 0)
  }))

// ---------------------------------------------------------------- waivers, end to end

test('an inline waiver with a written reason clears the finding', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write(
      'docs/a.md',
      `intro\n${DEAD} <!-- prose-path-ok: the file lands in the next slice -->\n`,
    )
    r.git('add', '-A')
    // GROUP: unusable-waiver-not-reported, waived-line-still-a-finding, waiver-never-recognised, waiver-reason-floor-removed
    assert.equal(run(r).status, 0)
    // MUTATION: drop the EMPTY_REASONS/length floor from parseWaiver → the second half goes
    // green too, and the hatch costs nothing.
    r.write('docs/a.md', `intro\n${DEAD} <!-- prose-path-ok: ok -->\n`)
    r.git('add', '-A')
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /must state WHY/)
  }))

// ---------------------------------------------------------------- per-line grouping

test('groups every dead path on one line into a single finding row', () => {
  // `evaluate` batches one `git check-ignore` call, so it needs a git repo as cwd — the suite's
  // own, which no case here mutates. Neither token below is ignored anywhere.
  const index = buildIndex(['docs/a.md'])
  const read = () => 'see docs/gone.md and docs/also-gone.md for the list\n'
  // MUTATION: key `perLine` on the token rather than on path + line number → one sentence
  // naming two absent files becomes two baseline rows that must be fixed and recorded
  // separately, when the unit under baseline is the LINE.
  const res = evaluate(['docs/a.md'], read, index)
  assert.equal(res.findings.size, 1)
  assert.deepEqual([...res.findings.values()][0].tokens, ['docs/gone.md', 'docs/also-gone.md'])
})

test('treats an unreadable corpus file as a problem, never a skipped file', () => {
  const read = () => {
    throw Object.assign(new Error('nope'), { code: 'EACCES' })
  }
  // MUTATION: `continue` without pushing to `problems` in collectCandidates's read catch →
  // a permission bit or a mid-run tree change makes a whole file invisible at exit 0.
  const res = evaluate(['docs/a.md'], read, buildIndex(['docs/a.md']))
  assert.equal(res.problems.length, 1)
  assert.match(res.problems[0].problem, /EACCES/)
})

test('reports two physically distinct identical lines as separate findings', () => {
  // `evaluate` batches one `git check-ignore` call, so it needs a git repo as cwd — the suite's
  // own, which no case here mutates. Like the other direct-`evaluate` cases above (and unlike
  // every `withRepo` case, which sandboxes its paths), it therefore resolves against the REAL
  // repo: the sentinels those cases share must stay absent, or `resolves` finds one via
  // existsSync, the lines stop being findings, and they redden for a reason unrelated to what
  // they pin.
  // MUTATION: change `seen.set(dupKey, occurrence + 1)` to `seen.set(dupKey, occurrence)` in
  // evaluate → occurrence never increments; both identical lines get occurrence=0; the second
  // finding's key overwrites the first in the findings Map; findings.size drops to 1; once the
  // first copy is baselined its identical twin is silently excused.
  const index = buildIndex(['docs/a.md'])
  const read = () => 'see docs/gone.md for details\nsee docs/gone.md for details\n'
  const res = evaluate(['docs/a.md'], read, index)
  assert.equal(res.findings.size, 2)
})

// ---------------------------------------------------------------- scope footer gating

test('scope footer is absent when the only failure is a stale baseline row', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${DEAD}\n`)
    r.git('add', '-A')
    baseline(r)
    r.git('commit', '-qm', 'init')
    // Fix the dead citation — baseline row becomes stale; fresh and scopedProblems are empty
    r.write('docs/a.md', 'no citation here\n')
    r.git('add', '-A')
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /describe no live finding/)
    // MUTATION: change `if (fresh.length > 0 || scopedProblems.length > 0)` to `if (true)` →
    // the scope footer prints on every failure including stale-row maintenance, answering a
    // question the reader did not ask.
    assert.doesNotMatch(res.stderr, /Searched:/)
  }))

test('scope footer is present when a fresh finding is blocked', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', `intro\n${DEAD}\n`)
    r.git('add', '-A')
    const res = run(r)
    assert.equal(res.status, 1)
    // MUTATION: change `if (fresh.length > 0 || scopedProblems.length > 0)` to `if (false)` →
    // the scope footer is suppressed even when corpus-scan findings are present.
    assert.match(res.stderr, /Searched:/)
  }))

test('scope footer is present when only a waiver problem is found', () =>
  withRepo((r) => {
    // A bad prose-path-ok waiver creates scopedProblems, NOT a fresh finding.
    // fresh.length === 0, scopedProblems.length === 1 — exercises the || RHS independently.
    r.write('docs/a.md', `intro\n${DEAD} <!-- prose-path-ok: ok -->\n`)
    r.git('add', '-A')
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /must state WHY/)
    // MUTATION: drop `|| scopedProblems.length > 0` from the footer condition →
    // the scope footer is suppressed when only a waiver problem exists.
    assert.match(res.stderr, /Searched:/)
  }))

// ---------------------------------------------------------------- exclusion class, end to end

// GROUP: placeholder-class-removed, unpaired-angle-placeholder-class-removed
test('does not flag a placeholder ending in > when TRAIL strips the bracket before classify', () =>
  withRepo((r) => {
    // `.claude` must be a tracked top-level entry so looksLikePath accepts the token.
    r.write('.claude/hooks/guard.mjs', '// placeholder guard\n')
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    // PATH_RE captures `.claude/agents/<name>`, then TRAIL (/[.,;:)\]'"`>]+$/) strips the
    // trailing `>`, producing `.claude/agents/<name`. PLACEHOLDER alone does not match it
    // (no closing `>` remains), so without `t.includes('<')` it reaches 'unresolved'.
    // NON-VACUITY: without the `.claude` top-level entry the token does not pass looksLikePath
    // and never reaches classify — no finding for the wrong reason. withRepo always writes a
    // baseline under that directory, so the entry is present either way; the write above is
    // belt-and-suspenders.
    r.write('docs/a.md', 'intro\nlaunch the agent at .claude/agents/<name> passing the task\n')
    r.git('add', '-A')
    // MUTATION: remove `|| t.includes('<') || t.includes('>')` from classify's placeholder
    // branch → `.claude/agents/<name` (TRAIL-stripped) classifies as 'unresolved' and blocks.
    assert.equal(run(r).status, 0)
  }))
