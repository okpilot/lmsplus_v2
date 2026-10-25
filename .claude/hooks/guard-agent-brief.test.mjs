// Unit test for the PreToolUse Agent-brief guard. Run:
//   node --test .claude/hooks/guard-agent-brief.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// ({"cwd":"...","tool_name":"Agent","tool_input":{"subagent_type":"...","prompt":"..."}}) on
// STDIN — the channel the harness actually uses — so these tests pin the input contract, not
// just the pattern matching. Pattern: guard-bash.test.mjs.
//
// SendMessage coverage lives in guard-agent-brief.sendmessage.test.mjs — split out of this
// file. Fixtures and helpers shared by both suites
// live in guard-agent-brief.testkit.mjs.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  BROKEN_ROOT,
  cleanupFixtures,
  EMPTY_ROOT,
  exactBrief,
  extraFor,
  fillTemplate,
  HOOKS_DIR,
  makePlanRoot,
  NO_PIPELINE_ROOT,
  PARTIAL_ROOT,
  PLAN_REL,
  payload,
  ROLELESS_ROOT,
  runHook,
  TEMPLATES,
} from './guard-agent-brief.testkit.mjs'

after(cleanupFixtures)

// CONTROL: red
// GROUP: guard-agent-brief-always-passes
test('blocks a semantic-reviewer brief carrying an extra CONTEXT line with exit 2 and a BLOCKED stderr', () => {
  const brief = `${exactBrief('semantic-reviewer')}\nAlso check the auth flow while you're in there.`
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED: semantic-reviewer/)
  assert.match(r.stderr, /does not match its required template/)
  assert.match(r.stderr, /Expected:/)
})

// CONTROL: green
// GROUP: guard-agent-brief-always-blocks
test('allows an exact semantic-reviewer brief with exit 0', () => {
  const r = runHook(payload('semantic-reviewer', exactBrief('semantic-reviewer')))
  assert.equal(r.status, 0)
})

// GROUP: guard-agent-brief-stdin-cwd-root
test('allows an exact semantic-reviewer brief when the payload cwd is a different directory', () => {
  const otherCwd = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-cwd-'))
  try {
    const r = runHook(payload('semantic-reviewer', exactBrief('semantic-reviewer'), {}, otherCwd))
    assert.equal(r.status, 0)
    assert.equal(r.stderr, '')
  } finally {
    rmSync(otherCwd, { recursive: true, force: true })
  }
})

test('allows a non-gated subagent_type with any prompt', () => {
  const r = runHook(payload('my-custom-type', 'do whatever you want, no template applies'))
  assert.equal(r.status, 0)
})

test('allows general-purpose with any prompt', () => {
  const r = runHook(payload('general-purpose', 'go explore the repo'))
  assert.equal(r.status, 0)
})

for (const type of Object.keys(TEMPLATES)) {
  test(`allows ${type}'s exact template brief with exit 0`, () => {
    const r = runHook(payload(type, exactBrief(type), extraFor(type)))
    assert.equal(r.status, 0)
  })
}

// GROUP: guard-agent-brief-round-class-widened
test('blocks a round that is not digits or "after-loop" (e.g. "2a") with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['semantic-reviewer'], { round: '2a' })
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
})

test('blocks a branch containing a space with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['semantic-reviewer'], { branch: 'feature branch' })
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
})

test('blocks a branch containing a newline with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['semantic-reviewer'], { branch: 'feature\nbranch' })
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-isolation-worktree-check-disabled
test('blocks code-review-skill without isolation: worktree with exit 2', () => {
  const brief = exactBrief('code-review-skill')
  const r = runHook(payload('code-review-skill', brief, { model: 'opus' }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /requires isolation: "worktree"/)
})

// GROUP: guard-agent-brief-model-opus-check-disabled
test('blocks code-review-skill with model "sonnet" with exit 2', () => {
  const brief = exactBrief('code-review-skill')
  const r = runHook(payload('code-review-skill', brief, { isolation: 'worktree', model: 'sonnet' }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /requires model omitted or its pipeline\.json alias/)
})

// the model floor applies to every gated type, not only code-review-skill (which is also
// isolation-gated): a gated type with no isolation requirement still has its model checked.
// GROUP: guard-agent-brief-model-opus-check-disabled
test('blocks semantic-reviewer with a model that is not its pipeline.json alias with exit 2', () => {
  const r = runHook(
    payload('semantic-reviewer', exactBrief('semantic-reviewer'), { model: 'opus' }),
  )
  assert.equal(r.status, 2)
  assert.match(r.stderr, /requires model omitted or its pipeline\.json alias/)
})

// GROUP: guard-agent-brief-name-check-disabled
test('blocks a gated brief dispatched with a name with exit 2', () => {
  const r = runHook(
    payload('semantic-reviewer', exactBrief('semantic-reviewer'), { name: 'reviewer-1' }),
  )
  assert.equal(r.status, 2)
  assert.match(r.stderr, /must not carry a name/)
})

test('allows semantic-reviewer with model explicitly set to its pipeline.json alias', () => {
  const r = runHook(
    payload('semantic-reviewer', exactBrief('semantic-reviewer'), { model: 'sonnet' }),
  )
  assert.equal(r.status, 0)
})

test('allows code-review-skill with model omitted (undefined defaults to opus)', () => {
  const brief = exactBrief('code-review-skill')
  const r = runHook(payload('code-review-skill', brief, { isolation: 'worktree' }))
  assert.equal(r.status, 0)
})

test('fails open but loud on unparseable stdin (exit 0 + unparseable warning)', () => {
  const r = runHook('not-json')
  assert.equal(r.status, 0)
  assert.match(r.stderr, /unparseable/)
})

test('fails open but loud on empty stdin (exit 0 + stderr warning)', () => {
  const r = runHook('')
  assert.equal(r.status, 0)
  assert.match(r.stderr, /unparseable hook payload/)
})

// GROUP: guard-agent-brief-oversize-allows
test('blocks a steered brief padded past 1MB with exit 2', () => {
  const brief = `${fillTemplate(TEMPLATES['semantic-reviewer'], {})}\nFOCUS: ${'x'.repeat(1_100_000)}`
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /exceeds 1MB/)
})

test('the gated template set equals the pipeline.json agents with role gate-round, conditional or tests-first', () => {
  const pipeline = JSON.parse(readFileSync(path.join(HOOKS_DIR, '..', 'pipeline.json'), 'utf8'))
  assert.equal(
    pipeline.agents['test-author']?.role,
    'tests-first',
    'pipeline.json agents.test-author with role tests-first is missing',
  )
  const expected = new Set(
    Object.entries(pipeline.agents)
      .filter(([, a]) => ['gate-round', 'conditional', 'tests-first'].includes(a.role))
      .map(([n]) => n),
  )
  const actual = new Set(Object.keys(TEMPLATES))
  assert.deepEqual([...actual].sort(), [...expected].sort())
})

// --- test-author (#1614): gated by its template, {plan} must be an existing file under .work/ ---

const TA = 'test-author'
const hasTemplate = () => {
  assert.equal(typeof TEMPLATES[TA], 'string', 'gate-briefs.json templates.test-author is missing')
}
const taBrief = (plan) => fillTemplate(TEMPLATES[TA], { plan })

test("allows test-author's exact filled template brief with exit 0", () => {
  hasTemplate()
  const r = runHook(payload(TA, exactBrief(TA)))
  assert.equal(r.status, 0, r.stderr)
})

test('the test-author template carries a {plan} placeholder', () => {
  hasTemplate()
  assert.match(TEMPLATES[TA], /\{plan\}/)
})

test('blocks a test-author brief that is not its filled template with exit 2', () => {
  hasTemplate()
  const r = runHook(payload(TA, `${exactBrief(TA)}\nAlso fix the implementation.`))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED: test-author/)
  assert.match(r.stderr, /does not match its required template/)
})

test('blocks the test-author template dispatched through an ungated type with exit 2', () => {
  hasTemplate()
  const r = runHook(payload('general-purpose', exactBrief(TA)))
  assert.equal(r.status, 2)
})

test('blocks a test-author brief dispatched with isolation: "worktree" with exit 2', () => {
  hasTemplate()
  const r = runHook(payload(TA, exactBrief(TA), { isolation: 'worktree' }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /must not use isolation: "worktree"/)
})

test('blocks a test-author brief with a model other than sonnet with exit 2', () => {
  hasTemplate()
  const r = runHook(payload(TA, exactBrief(TA), { model: 'opus' }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /requires model omitted or its pipeline\.json alias/)
})

test('allows a test-author brief whose plan is a nested path under .work/', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    mkdirSync(path.join(root, '.work/retro/sub'), { recursive: true })
    writeFileSync(path.join(root, '.work/retro/sub/a-1_b.md'), '# plan\n')
    const r = runHook(payload(TA, taBrief('.work/retro/sub/a-1_b.md')), root)
    assert.equal(r.status, 0, r.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('allows a test-author brief whose plan is a symlink to a file inside .work/', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    writeFileSync(path.join(root, '.work/real.md'), '# plan\n')
    symlinkSync(path.join(root, '.work/real.md'), path.join(root, '.work/link.md'))
    const r = runHook(payload(TA, taBrief('.work/link.md')), root)
    assert.equal(r.status, 0, r.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** A {plan} the hook must refuse because the path fails the filesystem check (reason `plan`). */
function assertPlanBlocked(root, plan) {
  const r = runHook(payload(TA, taBrief(plan)), root)
  assert.equal(r.status, 2, `expected exit 2 for plan ${plan}, got ${r.status}: ${r.stderr}`)
  assert.match(r.stderr, /BLOCKED: test-author brief/)
  assert.match(r.stderr, /plan/)
  assert.doesNotMatch(r.stderr, /does not match its required template/)
}

/** The {plan} regex alone blocks: the path exists, the template-mismatch message is acceptable. */
function assertExit2(root, plan) {
  const r = runHook(payload(TA, taBrief(plan)), root)
  assert.equal(r.status, 2, `expected exit 2 for plan ${plan}, got ${r.status}: ${r.stderr}`)
  assert.match(r.stderr, /BLOCKED: test-author brief/)
}

// GROUP: guard-agent-brief-plan-exists-check-disabled
test('blocks a test-author brief whose plan file does not exist with reason plan', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    assertPlanBlocked(root, '.work/missing-plan.md')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// GROUP: guard-agent-brief-plan-exists-check-disabled, guard-agent-brief-plan-isfile-disabled
test('blocks a test-author brief whose plan is a directory named *.md with reason plan', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    mkdirSync(path.join(root, '.work/x.md'))
    assertPlanBlocked(root, '.work/x.md')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// GROUP: guard-agent-brief-plan-exists-check-disabled, guard-agent-brief-plan-containment-disabled
test('blocks a test-author brief whose plan is a symlink out of .work/ with reason plan', () => {
  hasTemplate()
  const root = makePlanRoot()
  const outside = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-outside-'))
  try {
    writeFileSync(path.join(outside, 'secret.md'), '# not a plan\n')
    symlinkSync(path.join(outside, 'secret.md'), path.join(root, '.work/escape.md'))
    assertPlanBlocked(root, '.work/escape.md')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

// GROUP: guard-agent-brief-plan-exists-check-disabled, guard-agent-brief-plan-containment-disabled
test('blocks a test-author brief whose plan runs through a symlinked directory out of .work/ with reason plan', () => {
  hasTemplate()
  const root = makePlanRoot()
  const outside = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-outside-'))
  try {
    writeFileSync(path.join(outside, 'p.md'), '# not a plan\n')
    symlinkSync(outside, path.join(root, '.work/outdir'))
    assertPlanBlocked(root, '.work/outdir/p.md')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('blocks a test-author brief whose plan has a .. segment with exit 2', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    writeFileSync(path.join(root, 'outside.md'), '# not under .work\n')
    for (const plan of ['.work/../outside.md', '.work/a/../../outside.md']) {
      const r = runHook(payload(TA, taBrief(plan)), root)
      assert.equal(r.status, 2, `expected exit 2 for plan ${plan}`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('blocks a test-author brief whose plan is outside .work/ with exit 2', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    mkdirSync(path.join(root, 'docs'), { recursive: true })
    writeFileSync(path.join(root, 'docs/plan.md'), '# plan\n')
    for (const plan of ['docs/plan.md', '/etc/passwd.md', '.workx/plan.md', '.work/plan.txt']) {
      const r = runHook(payload(TA, taBrief(plan)), root)
      assert.equal(r.status, 2, `expected exit 2 for plan ${plan}`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// GROUP: guard-agent-brief-plan-pattern-widened
test('blocks a test-author brief whose plan is an existing non-.md file with exit 2', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    writeFileSync(path.join(root, '.work/fixture-plan.txt'), 'plan\n')
    assertExit2(root, '.work/fixture-plan.txt')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// GROUP: guard-agent-brief-plan-pattern-widened
test('blocks a test-author brief whose existing plan path has a sub/.. segment with exit 2', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    mkdirSync(path.join(root, '.work/sub'))
    writeFileSync(path.join(root, '.work/fixture-plan.md'), '# plan\n')
    assertExit2(root, '.work/sub/../fixture-plan.md')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// GROUP: guard-agent-brief-tests-first-role-ungated
test('blocks a tests-first agent that has no template, by role', () => {
  hasTemplate()
  const root = makePlanRoot()
  try {
    const pf = path.join(root, '.claude/pipeline.json')
    const doc = JSON.parse(readFileSync(pf, 'utf8'))
    doc.agents['ghost-author'] = { model: 'sonnet', write: true, role: 'tests-first' }
    writeFileSync(pf, JSON.stringify(doc))
    const r = runHook(payload('ghost-author', 'anything'), root)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /no template for gated type ghost-author/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the default fixture plan exists in the fixture root and fills {plan}', () => {
  hasTemplate()
  assert.equal(PLAN_REL, '.work/fixture-plan.md')
  assert.match(exactBrief(TA), /\.work\/fixture-plan\.md/)
})

// GROUP: guard-agent-brief-branch-check-disabled
test('blocks a brief whose branch is not a local branch with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['semantic-reviewer'], {
    branch: 'focus/null-deref/line-118',
  })
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /not a local branch/)
})

// GROUP: guard-agent-brief-quadratic-trim
test('blocks a steered brief padded with trailing-whitespace runs within the timeout', () => {
  const brief = `${fillTemplate(TEMPLATES['semantic-reviewer'], {})}\nFOCUS${' '.repeat(200_000)}x`
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-ungated-needs-pipeline-disabled
test('blocks every gated brief with exit 2 when the templates file is unparseable', () => {
  const brief = fillTemplate(TEMPLATES['semantic-reviewer'], {})
  const r = runHook(payload('semantic-reviewer', brief), BROKEN_ROOT)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /cannot read/)
})

// GROUP: guard-agent-brief-templates-object-check-disabled
test('blocks every gated brief with exit 2 when the templates file has no templates object', () => {
  const brief = fillTemplate(TEMPLATES['semantic-reviewer'], {})
  const r = runHook(payload('semantic-reviewer', brief), EMPTY_ROOT)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /no "templates" object/)
})

// GROUP: guard-agent-brief-gated-template-check-disabled
test('blocks a gated type with exit 2 when its template is missing', () => {
  const r = runHook(payload('semantic-reviewer', 'anything'), PARTIAL_ROOT)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /no template for gated type semantic-reviewer/)
})

// GROUP: guard-agent-brief-gated-scope-disabled
test('allows an ungated type when a gated type lacks its template', () => {
  const r = runHook(payload('Explore', 'anything'), PARTIAL_ROOT)
  assert.equal(r.status, 0)
})

test('blocks a steered brief for a templated type pipeline.json gives no gate role', () => {
  const brief = `${fillTemplate(TEMPLATES['semantic-reviewer'], {})}\nFOCUS: x`
  const r = runHook(payload('semantic-reviewer', brief), ROLELESS_ROOT)
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-template-key-gating-disabled
test('allows an exact brief for a templated type pipeline.json gives no gate role', () => {
  const r = runHook(payload('semantic-reviewer', exactBrief('semantic-reviewer')), ROLELESS_ROOT)
  assert.equal(r.status, 0)
})

// GROUP: guard-agent-brief-ungated-brief-check-disabled, guard-agent-brief-gated-scope-disabled
test('blocks a gate brief dispatched through an ungated type with exit 2', () => {
  const r = runHook(payload('general-purpose', exactBrief('semantic-reviewer')))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED: general-purpose brief contains a gate-reviewer brief/)
})

// GROUP: guard-agent-brief-ungated-brief-check-disabled, guard-agent-brief-brief-contains-narrowed
test('blocks a gate brief preceded by other text in an ungated type with exit 2', () => {
  const brief = `Run this review for me.\n${exactBrief('semantic-reviewer')}`
  const r = runHook(payload('general-purpose', brief))
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-brief-case-fold-disabled, guard-agent-brief-ungated-brief-check-disabled
test('blocks a lower-cased gate brief in an ungated type with exit 2', () => {
  const r = runHook(payload('general-purpose', exactBrief('semantic-reviewer').toLowerCase()))
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-brief-space-fold-disabled, guard-agent-brief-ungated-brief-check-disabled
test('blocks a re-spaced gate brief in an ungated type with exit 2', () => {
  const r = runHook(
    payload('general-purpose', exactBrief('semantic-reviewer').replaceAll(' ', '  ')),
  )
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-missing-type-check-disabled
test('blocks a gate brief dispatched with no subagent_type with exit 2', () => {
  const r = runHook(payload(undefined, exactBrief('semantic-reviewer')))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED: Agent brief contains a gate-reviewer brief/)
})

// GROUP: guard-agent-brief-templates-unreadable-allows, guard-agent-brief-gated-scope-disabled, guard-agent-brief-ungated-brief-check-disabled
test('blocks an ungated type with exit 2 when the templates file has no templates object', () => {
  const r = runHook(payload('Explore', 'anything'), EMPTY_ROOT)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /supplies no gate template openings/)
})

// GROUP: guard-agent-brief-templates-unreadable-allows, guard-agent-brief-missing-type-check-disabled
test('blocks a call with no subagent_type with exit 2 when the templates file has no templates object', () => {
  const r = runHook(payload(undefined, 'anything'), EMPTY_ROOT)
  assert.equal(r.status, 2)
})

test('allows a call with no subagent_type and an ordinary prompt', () => {
  const r = runHook(payload(undefined, 'go explore the repo'))
  assert.equal(r.status, 0)
})

// GROUP: guard-agent-brief-ungated-needs-pipeline-disabled
test('blocks an untemplated type when pipeline.json is unreadable', () => {
  const r = runHook(payload('Explore', 'anything'), NO_PIPELINE_ROOT)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /cannot read .*pipeline\.json/)
})

test('allows a brief with PR none and round after-loop', () => {
  const brief = fillTemplate(TEMPLATES['red-team'], { round: 'after-loop', pr: 'none' })
  const r = runHook(payload('red-team', brief))
  assert.equal(r.status, 0)
})

// GROUP: guard-agent-brief-pr-class-widened
test('blocks a brief whose PR number has no hash sign with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['semantic-reviewer'], { pr: '123' })
  const r = runHook(payload('semantic-reviewer', brief))
  assert.equal(r.status, 2)
})

// code-review-skill's template repeats {branch} (once in the TASK line, again in the diff
// range). The two occurrences must bind to the SAME value via a regex backreference — this
// mismatched pair is only rejected if that binding is enforced; independently-matched
// placeholders would let each occurrence take its own branch name.
// GROUP: guard-agent-brief-backreference-disabled
test('blocks code-review-skill when its two {branch} occurrences disagree with exit 2', () => {
  const template = TEMPLATES['code-review-skill']
  const brief = template
    .replace('{round}', '1')
    .replace('{pr}', '#123')
    .replace('{branch}', 'chore/agent-brief-guard')
    .replace('{branch}', 'some-other-branch')
  const r = runHook(payload('code-review-skill', brief, { isolation: 'worktree', model: 'opus' }))
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-other-worktree-check-disabled
test('blocks a semantic-reviewer brief dispatched with isolation: "worktree" with exit 2', () => {
  const brief = exactBrief('semantic-reviewer')
  const r = runHook(payload('semantic-reviewer', brief, { isolation: 'worktree' }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /must not use isolation: "worktree"/)
})

test('allows a semantic-reviewer brief with isolation omitted', () => {
  const r = runHook(payload('semantic-reviewer', exactBrief('semantic-reviewer')))
  assert.equal(r.status, 0)
})
