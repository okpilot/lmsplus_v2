// Run: node --test .claude/hooks/check-prose-claims.repo.test.mjs
//
// The git-facing and subprocess paths of the prose-claims guard: corpus scoping, the
// baseline ratchet, the staged/index read, and the exit-code split. The pure decision logic
// lives in check-prose-claims.test.mjs, so neither file approaches the test-file cap in
// .claude/limits.json.
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns it red, and
// every break was EXECUTED before being written down (`code-style.md` §7 — a `MUTATION:` line
// is a prose claim). Some breaks redden a GROUP of cases rather than one; those carry a
// `GROUP:` marker naming the mutation id. The EXACT set each break reddens is DATA, in
// check-prose-claims.mutations.json, and `node .claude/hooks/run-mutations.mjs --guard
// check-prose-claims` re-derives it — do not hand-maintain a second copy here.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'check-prose-claims.mjs')

const LIMITS = JSON.stringify({
  rules: [
    { kind: 'test file', glob: '**/*.test.*', max: 500 },
    { kind: 'utility/helper', glob: '**/*.ts', max: 200 },
  ],
})

const CLAIM = 'the cap here is 500 lines for a test file'

/** A throwaway repo, removed however the body exits. */
function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'prose-claims-'))
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
    write('.claude/limits.json', LIMITS)
    write('.claude/prose-claims.json', JSON.stringify({ claims: {} }))
    return fn({ dir, git, write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Run the guard in `dir`. `runNode`, not `execFileSync`: the latter surfaces stderr only
 * on the THROWING path, so a case asserting on the diagnostics of a SUCCESSFUL run (every
 * `--update-baseline` case) would compare against an empty string and pass vacuously in one
 * direction. Found by that exact vacuity.
 */
function run({ dir }, args = []) {
  const { status, stderr, stdout } = runNode('check-prose-claims', [GUARD, ...args], { cwd: dir })
  return { status, stderr, stdout }
}

/** Baseline the whole corpus, then return the file's exact bytes. */
function baseline({ dir }) {
  const r = run({ dir }, ['--update-baseline'])
  if (r.status !== 0) throw new Error(`baseline: exited ${r.status} — ${r.stderr}`)
  return readFileSync(join(dir, '.claude/prose-claims.json'), 'utf8')
}

// ---------------------------------------------------------------- enforcement

test('blocks a commit that stages a new prose claim', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', `intro\n${CLAIM}\n`)
    r.git('add', '-A')
    // MUTATION: filter `fresh` to `baseline[key] !== undefined` → a claim absent from the
    // baseline stops being a finding, and the guard reports clean on everything forever.
    const res = run(r)
    // GROUP: new-claims-never-block
    assert.equal(res.status, 1)
    assert.match(res.stderr, /restates 500/)
    assert.match(res.stderr, /docs\/a\.md:2/)
  }))

test('does not block a claim already carried by the baseline', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${CLAIM}\n`)
    r.git('add', '-A')
    baseline(r)
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', `${CLAIM}\nan unrelated edit\n`)
    r.git('add', '-A')
    // MUTATION: ignore the baseline in `fresh` (drop the `baseline[key] === undefined`
    // test) → every grandfathered claim blocks every commit that touches its file, and the
    // ratchet becomes a gate nobody can pass.
    assert.equal(run(r).status, 0)
  }))

test('does not block a claim in a file the commit did not touch', () =>
  withRepo((r) => {
    r.write('docs/untouched.md', `${CLAIM}\n`)
    r.write('docs/b.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/b.md', 'intro\nedit\n')
    r.git('add', '-A')
    // MUTATION: make `inScope` return true unconditionally → introducing the guard blocks
    // every commit in the repo until the whole corpus is clean, which is why the baseline
    // exists at all.
    assert.equal(run(r).status, 0)
  }))

test('blocks when a baseline row no longer describes a live claim', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${CLAIM}\n`)
    r.git('add', '-A')
    baseline(r)
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', 'the cap now lives in limits.json\n')
    r.git('add', '-A')
    // MUTATION: drop the `stale.length > 0` term from the early-return condition → a claim
    // line that is edited or deleted leaves its baseline row behind forever, and the
    // shrink-only half of the ratchet stops existing.
    const res = run(r)
    // GROUP: stale-baseline-rows-never-reported
    assert.equal(res.status, 1)
    assert.match(res.stderr, /describe no live claim/)
  }))

// ---------------------------------------------------------------- corpus scoping

test('ignores a claim in agent memory', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/agent-memory/learner/MEMORY.md', `| row | ${CLAIM} |\n`)
    r.git('add', '-A')
    // MUTATION: delete the MEMORY_PREFIX test in inCorpus → tracker rows QUOTING a past
    // claim are graded as live restatements, so recording what went wrong becomes a
    // blocking offence.
    assert.equal(run(r).status, 0)
  }))

test('ignores a claim in the dated run log', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.claude/run-log.md', `2026-09-14 — split the file for ${CLAIM}\n`)
    r.git('add', '-A')
    // MUTATION: empty EXCLUDED_PATHS → a dated history entry is graded as a live claim.
    // History cannot be rewritten into a pointer, so the only remedy would be a waiver on
    // every log line that ever mentions a cap.
    assert.equal(run(r).status, 0)
  }))

test('ignores a claim in a spec whose tasks are all complete', () =>
  withRepo((r) => {
    r.write('.spec-workflow/specs/done/tasks.md', '- [x] a\n')
    r.write('.spec-workflow/specs/done/design.md', `${CLAIM}\n`)
    r.write('.spec-workflow/specs/live/tasks.md', '- [ ] a\n')
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('.spec-workflow/specs/done/design.md', `${CLAIM}\nmore\n`)
    r.write('.spec-workflow/specs/live/design.md', `${CLAIM}\n`)
    r.git('add', '-A')
    // MUTATION: make corpusFiles skip the completedSpecDirs filter → a completed spec, which
    // `agent-workflow.md § Rule-Mirror Sync` designates a historical record, is graded as a
    // live mirror. The live spec must still block, which is the other half of this case.
    const res = run(r)
    // GROUP: completed-spec-test-inverted, new-claims-never-block
    assert.equal(res.status, 1)
    assert.match(res.stderr, /specs\/live\/design\.md/)
    assert.doesNotMatch(res.stderr, /specs\/done\/design\.md/)
  }))

// ---------------------------------------------------------------- staged reads

test('grades the INDEX, not the working tree', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write('docs/a.md', `intro\n${CLAIM}\n`)
    r.git('add', '-A')
    r.write('docs/a.md', 'intro\n') // worktree cleaned up, index still carries the claim
    // MUTATION: make `read` use readFileSync in staged mode → the guard grades bytes git is
    // not committing, and a claim staged and then reverted in the worktree ships clean.
    // GROUP: new-claims-never-block
    assert.equal(run(r).status, 1)
  }))

// ---------------------------------------------------------------- fail closed

test('exits 2, not 1, when limits.json cannot be read', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${CLAIM}\n`)
    r.write('.claude/limits.json', '{ this is not json')
    r.git('add', '-A')
    // MUTATION: catch the JSON.parse of limits.json and fall back to `{}` (or return 1
    // instead of 2 from the CLI catch) → "could not run" becomes indistinguishable from a
    // finding, and the cheapest remedy for a broken invocation is a permanent waiver.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /could not run — BLOCKING/)
    assert.match(res.stderr, /Do NOT write a prose-claim-ok waiver/)
  }))

test('exits 2 when the baseline file is malformed', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${CLAIM}\n`)
    r.write('.claude/prose-claims.json', '{ "claims": [] }')
    r.git('add', '-A')
    // MUTATION: accept a non-object `claims` in readBaseline → an array baseline reads as
    // empty, every grandfathered claim becomes a finding, and the diagnostic blames the
    // prose rather than the data file.
    const res = run(r)
    assert.equal(res.status, 2)
    assert.match(res.stderr, /`claims` must be an object/)
  }))

test('treats an absent baseline as empty and blocks, rather than passing', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${CLAIM}\n`)
    rmSync(join(r.dir, '.claude/prose-claims.json'))
    r.git('add', '-A')
    // MUTATION: rethrow ENOENT in readBaseline, or return the live claim set from it → the
    // first-run case either aborts at exit 2 with no remedy, or passes clean. The direction
    // that fails CLOSED is to treat it as empty, so every claim is a visible finding.
    // GROUP: new-claims-never-block
    assert.equal(run(r).status, 1)
  }))

// ---------------------------------------------------------------- the ratchet is visible

test('never rewrites the baseline from an enforcement run', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    baseline(r)
    r.git('commit', '-qm', 'init')
    const before = readFileSync(join(r.dir, '.claude/prose-claims.json'), 'utf8')
    r.write('docs/a.md', `intro\n${CLAIM}\n`)
    r.git('add', '-A')
    // MUTATION: call updateBaseline from the enforcement path → the guard launders its own
    // finding into a clean run and the baseline grows with nothing in the diff to review.
    // GROUP: new-claims-never-block
    assert.equal(run(r).status, 1)
    assert.equal(readFileSync(join(r.dir, '.claude/prose-claims.json'), 'utf8'), before)
  }))

test('--update-baseline prints every added row before writing', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${CLAIM}\n`)
    r.git('add', '-A')
    // MUTATION: drop the `+` loop in updateBaseline → rows are added with no diagnostic, so
    // a reviewer sees only a JSON diff and has nothing telling them a new restatement was
    // grandfathered and needs an argument.
    const res = run(r, ['--update-baseline'])
    assert.equal(res.status, 0)
    assert.match(res.stderr, /\+ docs\/a\.md@/)
    assert.match(res.stderr, /REVIEW THE DIFF/)
  }))

test('--update-baseline refuses to write from an incomplete read', () =>
  withRepo((r) => {
    r.write('docs/a.md', `${CLAIM}\n`)
    r.write('docs/bad.md', `${CLAIM} // prose-claim-ok: ok\n`)
    r.git('add', '-A')
    // MUTATION: drop the `problems.length > 0` guard in the --update-baseline branch → a
    // baseline written from a partial read records the corpus as smaller than it is, and
    // every claim in the unread file is invisible from then on.
    const res = run(r, ['--update-baseline'])
    // GROUP: unusable-waiver-not-reported, waiver-never-recognised, waiver-reason-floor-removed
    assert.equal(res.status, 2)
    assert.match(res.stderr, /incomplete read/)
  }))

// ---------------------------------------------------------------- waivers, end to end

test('an inline waiver with a written reason clears the finding', () =>
  withRepo((r) => {
    r.write('docs/a.md', 'intro\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.write(
      'docs/a.md',
      `intro\n${CLAIM} <!-- prose-claim-ok: this sentence quotes the value a past fix corrected -->\n`,
    )
    r.git('add', '-A')
    // GROUP: unusable-waiver-not-reported, waived-line-still-becomes-a-claim, waiver-never-recognised, waiver-reason-floor-removed
    assert.equal(run(r).status, 0)
    // MUTATION: drop the EMPTY_REASONS/length floor from parseWaiver → the second half goes
    // green too, and the hatch costs nothing.
    r.write('docs/a.md', `intro\n${CLAIM} <!-- prose-claim-ok: ok -->\n`)
    r.git('add', '-A')
    const res = run(r)
    assert.equal(res.status, 1)
    assert.match(res.stderr, /must state WHY/)
  }))
