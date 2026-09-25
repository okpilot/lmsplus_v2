// Shared fixtures and helpers for the guard-agent-brief test suites
// (guard-agent-brief.test.mjs, guard-agent-brief.sendmessage.test.mjs). Split out so each suite
// stays under the test-file cap (code-style.md §1) without duplicating fixture setup. Pattern:
// spawn.testkit.mjs — not a suite itself, no ci.yml step of its own; each importer has one.
//
// Fixture creation runs as a MODULE-LEVEL side effect: ESM caches a module by resolved path, so
// every importer in the same process shares the same directories, created once. Each importing
// suite calls `cleanupFixtures()` from its own `after()` — this module never registers one itself.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

export const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url))
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
// {branch} must be a local branch of the root: a git repo whose one branch is the fillTemplate default.
mkdirSync(path.join(ROOT, '.claude/hooks'), { recursive: true })
copyFileSync(
  path.join(HOOKS_DIR, 'gate-briefs.json'),
  path.join(ROOT, '.claude/hooks/gate-briefs.json'),
)
copyFileSync(path.join(HOOKS_DIR, '..', 'pipeline.json'), path.join(ROOT, '.claude/pipeline.json'))
const git = (...args) =>
  execFileSync('git', [
    '-C',
    ROOT,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    ...args,
  ])
execFileSync('git', ['init', '-q', '-b', 'chore/agent-brief-guard', ROOT])
// gate-briefs.json is tracked, the plan is not — as in the real repo, a linked worktree lacks it.
git('add', '.claude/hooks/gate-briefs.json', '.claude/pipeline.json')
git('commit', '-q', '-m', 'init')
export const WORKTREE = path.join(ROOT, 'wt')
git('worktree', 'add', '-q', '-b', 'wt-branch', WORKTREE)
// A root whose templates file is unparseable.
export const BROKEN_ROOT = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-broken-'))
mkdirSync(path.join(BROKEN_ROOT, '.claude/hooks'), { recursive: true })
writeFileSync(path.join(BROKEN_ROOT, '.claude/hooks/gate-briefs.json'), '{')
// A root whose templates file parses but carries no templates object.
export const EMPTY_ROOT = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-empty-'))
mkdirSync(path.join(EMPTY_ROOT, '.claude/hooks'), { recursive: true })
writeFileSync(path.join(EMPTY_ROOT, '.claude/hooks/gate-briefs.json'), '{}')
copyFileSync(
  path.join(HOOKS_DIR, '..', 'pipeline.json'),
  path.join(EMPTY_ROOT, '.claude/pipeline.json'),
)
// A root whose templates file lacks one gated type's template.
export const PARTIAL_ROOT = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-partial-'))
mkdirSync(path.join(PARTIAL_ROOT, '.claude/hooks'), { recursive: true })
copyFileSync(
  path.join(HOOKS_DIR, '..', 'pipeline.json'),
  path.join(PARTIAL_ROOT, '.claude/pipeline.json'),
)
{
  const doc = JSON.parse(readFileSync(path.join(HOOKS_DIR, 'gate-briefs.json'), 'utf8'))
  delete doc.templates['semantic-reviewer']
  writeFileSync(path.join(PARTIAL_ROOT, '.claude/hooks/gate-briefs.json'), JSON.stringify(doc))
}
// A root whose pipeline.json is readable but gives no agent a gate role — the template key alone must gate.
export const ROLELESS_ROOT = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-roleless-'))
mkdirSync(path.join(ROLELESS_ROOT, '.claude/hooks'), { recursive: true })
copyFileSync(
  path.join(HOOKS_DIR, 'gate-briefs.json'),
  path.join(ROLELESS_ROOT, '.claude/hooks/gate-briefs.json'),
)
writeFileSync(path.join(ROLELESS_ROOT, '.claude/pipeline.json'), '{"agents":{}}')
// A git repo, like ROOT, so an EXACT brief (whose {branch} capture must resolve via
// `git show-ref`) can be graded here too — not only a steered one that never reaches branchExists.
// `refs/heads/<branch>` only exists after a first commit — an `init -b` alone leaves it unborn.
execFileSync('git', ['init', '-q', '-b', 'chore/agent-brief-guard', ROLELESS_ROOT])
execFileSync('git', [
  '-C',
  ROLELESS_ROOT,
  '-c',
  'user.name=t',
  '-c',
  'user.email=t@t',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
  'commit',
  '--allow-empty',
  '-q',
  '-m',
  'init',
])
// A root with templates but no pipeline.json.
export const NO_PIPELINE_ROOT = mkdtempSync(path.join(tmpdir(), 'guard-agent-brief-nopipeline-'))
mkdirSync(path.join(NO_PIPELINE_ROOT, '.claude/hooks'), { recursive: true })
copyFileSync(
  path.join(HOOKS_DIR, 'gate-briefs.json'),
  path.join(NO_PIPELINE_ROOT, '.claude/hooks/gate-briefs.json'),
)

/** Remove every fixture directory this module created. Each importing suite calls this from its
 * own `after()` — this module registers no lifecycle hook itself. */
export function cleanupFixtures() {
  rmSync(ROOT, { recursive: true, force: true })
  rmSync(NO_PIPELINE_ROOT, { recursive: true, force: true })
  rmSync(ROLELESS_ROOT, { recursive: true, force: true })
  rmSync(PARTIAL_ROOT, { recursive: true, force: true })
  rmSync(BROKEN_ROOT, { recursive: true, force: true })
  rmSync(EMPTY_ROOT, { recursive: true, force: true })
}

const TIMEOUT_MS = 5_000

const gateBriefs = JSON.parse(readFileSync(path.join(HOOKS_DIR, 'gate-briefs.json'), 'utf8'))
export const TEMPLATES = gateBriefs.templates

// runNode throws NO VERDICT on a signal, a timeout or a failed spawn — see guard-bash.test.mjs
// for why `status` must never be read off a killed child.
//
// GUARD_AGENT_BRIEF_ROOT points the hook's plan-path resolution at ROOT (this suite's throwaway
// fixture directory) instead of the real repo root — the real plans are gitignored and absent in
// CI. Every call goes through here so every test gets it, including ones that never touch a
// {plan} placeholder.
export function runHook(stdin, root = ROOT) {
  return runNode('guard-agent-brief.js', [HOOK], {
    input: stdin,
    timeout: TIMEOUT_MS,
    env: { ...process.env, GUARD_AGENT_BRIEF_ROOT: root },
  })
}

// `cwd` here is DECORATIVE — a realistic field on the real hook payload — never what {plan}
// resolves against; pass a bogus one to prove that.
export function payload(subagentType, prompt, extra = {}, cwd = ROOT) {
  return JSON.stringify({
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: { subagent_type: subagentType, prompt, ...extra },
  })
}

export const VALID_PLAN = '.spec-workflow/specs/agent-brief-guard/plan.md'

/** Fill a template's placeholders with valid sample values. A placeholder repeated in one
 * template (code-review-skill's `{branch}`) gets the same value both times via replaceAll.
 * `{requirements}` (implementation-critic only) defaults to `VALID_PLAN` when the template
 * carries the placeholder and the caller didn't name a value — every existing call site that
 * only ever set `{plan}` still gets a requirements value that passes `planPathValid`. */
export function fillTemplate(
  template,
  { round = '1', pr = '#123', branch = 'chore/agent-brief-guard', plan, requirements } = {},
) {
  let out = template
    .replaceAll('{round}', round)
    .replaceAll('{pr}', pr)
    .replaceAll('{branch}', branch)
  if (plan !== undefined) out = out.replaceAll('{plan}', plan)
  if (out.includes('{requirements}')) {
    out = out.replaceAll('{requirements}', requirements !== undefined ? requirements : VALID_PLAN)
  }
  return out
}

/** Extra `tool_input` fields a type's template alone doesn't cover. */
export function extraFor(type) {
  if (type === 'implementation-critic') return {}
  if (type === 'code-review-skill') return { isolation: 'worktree', model: 'opus' }
  return {}
}

export function exactBrief(type) {
  const opts =
    type === 'implementation-critic' ? { plan: VALID_PLAN, requirements: VALID_PLAN } : {}
  return fillTemplate(TEMPLATES[type], opts)
}
