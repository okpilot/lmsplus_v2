// Unit test for the PreToolUse Agent-brief guard. Run:
//   node --test .claude/hooks/guard-agent-brief.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// ({"cwd":"...","tool_name":"Agent","tool_input":{"subagent_type":"...","prompt":"..."}}) on
// STDIN — the channel the harness actually uses — so these tests pin the input contract, not
// just the pattern matching. Pattern: guard-bash.test.mjs.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(HOOKS_DIR, 'guard-agent-brief.js')
// A self-contained fixture root carrying the plan file — the real plans are gitignored and
// absent in CI. Passed to the hook as GUARD_AGENT_BRIEF_ROOT (see runHook), never as stdin
// `cwd`: the hook resolves {plan} against the repo root (or this override), not the caller's
// shell directory.
const ROOT = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-test-'))
mkdirSync(path.join(ROOT, '.spec-workflow/specs/agent-brief-guard'), { recursive: true })
writeFileSync(path.join(ROOT, '.spec-workflow/specs/agent-brief-guard/plan.md'), '# plan\n')
mkdirSync(path.join(ROOT, 'docs'))
writeFileSync(path.join(ROOT, 'docs/decisions.md'), '# decisions\n')

const TIMEOUT_MS = 5_000

const gateBriefs = JSON.parse(readFileSync(path.join(HOOKS_DIR, 'gate-briefs.json'), 'utf8'))
const TEMPLATES = gateBriefs.templates

// runNode throws NO VERDICT on a signal, a timeout or a failed spawn — see guard-bash.test.mjs
// for why `status` must never be read off a killed child.
//
// GUARD_AGENT_BRIEF_ROOT points the hook's plan-path resolution at ROOT (this suite's throwaway
// fixture directory) instead of the real repo root — the real plans are gitignored and absent in
// CI. Every call goes through here so every test gets it, including ones that never touch a
// {plan} placeholder.
function runHook(stdin) {
  return runNode('guard-agent-brief.js', [HOOK], {
    input: stdin,
    timeout: TIMEOUT_MS,
    env: { ...process.env, GUARD_AGENT_BRIEF_ROOT: ROOT },
  })
}

// `cwd` here is DECORATIVE — a realistic field on the real hook payload — never what {plan}
// resolves against; pass a bogus one to prove that.
function payload(subagentType, prompt, extra = {}, cwd = ROOT) {
  return JSON.stringify({
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: { subagent_type: subagentType, prompt, ...extra },
  })
}

/** Fill a template's placeholders with valid sample values. A placeholder repeated in one
 * template (code-review-skill's `{branch}`) gets the same value both times via replaceAll. */
function fillTemplate(
  template,
  { round = '1', pr = '#123', branch = 'chore/agent-brief-guard', plan } = {},
) {
  let out = template
    .replaceAll('{round}', round)
    .replaceAll('{pr}', pr)
    .replaceAll('{branch}', branch)
  if (plan !== undefined) out = out.replaceAll('{plan}', plan)
  return out
}

const VALID_PLAN = '.spec-workflow/specs/agent-brief-guard/plan.md'

/** Extra `tool_input` fields a type's template alone doesn't cover. */
function extraFor(type) {
  if (type === 'implementation-critic') return {}
  if (type === 'code-review-skill') return { isolation: 'worktree', model: 'opus' }
  return {}
}

function exactBrief(type) {
  const opts = type === 'implementation-critic' ? { plan: VALID_PLAN } : {}
  return fillTemplate(TEMPLATES[type], opts)
}

// CONTROL: red
// GROUP: guard-agent-brief-always-passes
test('blocks a code-reviewer brief carrying an extra CONTEXT line with exit 2 and a BLOCKED stderr', () => {
  const brief = `${exactBrief('code-reviewer')}\nAlso check the auth flow while you're in there.`
  const r = runHook(payload('code-reviewer', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /BLOCKED: code-reviewer/)
  assert.match(r.stderr, /does not match its required template/)
  assert.match(r.stderr, /Expected:/)
})

// CONTROL: green
// GROUP: guard-agent-brief-always-blocks
test('allows an exact code-reviewer brief with exit 0', () => {
  const r = runHook(payload('code-reviewer', exactBrief('code-reviewer')))
  assert.equal(r.status, 0)
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

test('blocks a round that is not digits or "after-loop" (e.g. "2a") with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['code-reviewer'], { round: '2a' })
  const r = runHook(payload('code-reviewer', brief))
  assert.equal(r.status, 2)
})

test('blocks a branch containing a space with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['code-reviewer'], { branch: 'feature branch' })
  const r = runHook(payload('code-reviewer', brief))
  assert.equal(r.status, 2)
})

test('blocks a branch containing a newline with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['code-reviewer'], { branch: 'feature\nbranch' })
  const r = runHook(payload('code-reviewer', brief))
  assert.equal(r.status, 2)
})

// GROUP: guard-agent-brief-plan-exists-always-passes
test('blocks implementation-critic when the plan file does not exist on disk with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['implementation-critic'], {
    plan: '.spec-workflow/specs/agent-brief-guard/plan-missing.md',
  })
  const r = runHook(payload('implementation-critic', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /invalid \{plan\} path/)
})

test('blocks implementation-critic when the plan path contains ".." with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['implementation-critic'], {
    plan: '.spec-workflow/specs/../agent-brief-guard/plan.md',
  })
  const r = runHook(payload('implementation-critic', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /invalid \{plan\} path/)
})

// planPathValid's format regex has no dedicated pinning test above — the ".." test and the
// missing-file test both also fail the exists-on-disk check, so neither reddens when only the
// regex line is disabled. This plan matches no `.work`/`.spec-workflow/specs` prefix, has no
// "..", and names a real file — the regex is the only check that can block it.
// GROUP: guard-agent-brief-plan-regex-always-passes
test('blocks implementation-critic when the plan path is outside .work and .spec-workflow/specs with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['implementation-critic'], {
    plan: 'docs/decisions.md',
  })
  const r = runHook(payload('implementation-critic', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /invalid \{plan\} path/)
})

// path.join collapses "foo/.." away, so this resolves to the same real file as VALID_PLAN —
// matches the format regex and exists on disk. Only the explicit `plan.includes('..')` check
// blocks it, unlike the ".." test above (which fails the exists check too after collapsing).
// GROUP: guard-agent-brief-plan-dotdot-always-passes
test('blocks implementation-critic when the plan path contains ".." that collapses to an existing file with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['implementation-critic'], {
    plan: '.spec-workflow/specs/agent-brief-guard/foo/../plan.md',
  })
  const r = runHook(payload('implementation-critic', brief))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /invalid \{plan\} path/)
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
  assert.match(r.stderr, /requires model "opus" or omitted/)
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

test('fails open but loud on a payload over 1MB (exit 0 + size warning)', () => {
  const r = runHook('x'.repeat(1_100_000))
  assert.equal(r.status, 0)
  assert.match(r.stderr, /exceeds 1MB/)
})

test('the gated template set equals the pipeline.json agents with role gate-round or conditional, plus code-review-skill', () => {
  const pipeline = JSON.parse(readFileSync(path.join(HOOKS_DIR, '..', 'pipeline.json'), 'utf8'))
  const expected = new Set(
    Object.entries(pipeline.agents)
      .filter(([, a]) => a.role === 'gate-round' || a.role === 'conditional')
      .map(([n]) => n),
  )
  expected.add('code-review-skill')
  const actual = new Set(Object.keys(TEMPLATES))
  assert.deepEqual([...actual].sort(), [...expected].sort())
})

test('allows a brief with PR none and round after-loop', () => {
  const brief = fillTemplate(TEMPLATES['red-team'], { round: 'after-loop', pr: 'none' })
  const r = runHook(payload('red-team', brief))
  assert.equal(r.status, 0)
})

test('blocks a brief whose PR number has no hash sign with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['code-reviewer'], { pr: '123' })
  const r = runHook(payload('code-reviewer', brief))
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

// {plan} must resolve against the repo root (GUARD_AGENT_BRIEF_ROOT here), never the stdin
// `cwd` — a bogus cwd that carries no plan file at all must not block a real, existing plan.
test('allows implementation-critic with a valid existing plan when stdin cwd points elsewhere', () => {
  const brief = fillTemplate(TEMPLATES['implementation-critic'], { plan: VALID_PLAN })
  const r = runHook(
    payload('implementation-critic', brief, {}, '/nonexistent-cwd-should-be-ignored'),
  )
  assert.equal(r.status, 0)
})

// GROUP: guard-agent-brief-other-worktree-check-disabled
test('blocks a code-reviewer brief dispatched with isolation: "worktree" with exit 2', () => {
  const brief = exactBrief('code-reviewer')
  const r = runHook(payload('code-reviewer', brief, { isolation: 'worktree' }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /must not use isolation: "worktree"/)
})

// Every gated type but code-review-skill takes this path — implementation-critic is a second,
// independent example (it also carries the {plan} check, so this proves the two aren't confused).
test('blocks an implementation-critic brief dispatched with isolation: "worktree" with exit 2', () => {
  const brief = fillTemplate(TEMPLATES['implementation-critic'], { plan: VALID_PLAN })
  const r = runHook(payload('implementation-critic', brief, { isolation: 'worktree' }))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /must not use isolation: "worktree"/)
})

test('allows a code-reviewer brief with isolation omitted', () => {
  const r = runHook(payload('code-reviewer', exactBrief('code-reviewer')))
  assert.equal(r.status, 0)
})
