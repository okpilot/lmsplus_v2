#!/usr/bin/env node
// Invariant: .claude/pipeline.json matches the repo it describes.
//
// Every assertion below was an unchecked prose claim before 2026-09-07. The
// pipeline corpus restated each by hand in up to 17 places and nothing caught a
// drift; three independent audits found ~20 contradictions in it. See
// docs/decisions.md Decision 62.
//
// SCOPE — read this before adding a key to pipeline.json. This file asserts:
// agent-set closure both ways; per-agent model/tools/memory/role against
// frontmatter, with role checked against an expected map (enum membership alone
// would let a BLOCKING gate be relabelled); the single-writer invariant; closed
// key sets, top-level and per-agent, so an unchecked field cannot be reintroduced;
// existence of every declared path, and the parent DIRECTORY of a glob entry;
// the phase ordering; and the value carried by each hardcoded model FLAG.
// A key added to pipeline.json without a matching assertion here is an UNCHECKED
// claim that merely looks tested by sitting next to green ones — the exact defect
// this file exists to remove, and the closed-key checks now enforce it mechanically.
//
// NOTE: the tools comparison is exact-string, so reordering tools in frontmatter
// fails even when the SET is unchanged. Deliberate — it keeps one canonical spelling.
//
// Run:  node .claude/pipeline.test.mjs
// Override root for mutation testing:  node .claude/pipeline.test.mjs /tmp/scratch
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const spec = JSON.parse(readFileSync(join(ROOT, '.claude/pipeline.json'), 'utf8'))

let passed = 0
let failed = 0
const pass = (m) => {
  console.log(`PASS: ${m}`)
  passed++
}
const fail = (m) => {
  console.error(`FAIL: ${m}`)
  failed++
}

function frontmatter(name) {
  // Delimiters alone are not enough. With a file's real closer deleted, a raw
  // `indexOf('\n---')` scan runs on to any LATER line beginning with `---` and
  // swallows the body as frontmatter. Not every agent file has such a line —
  // derive, do not trust a count here: `grep -c '^---' .claude/agents/*.md`
  // (as of 2026-09-07: a footer rule in implementation-critic.md, and
  // `--- FINDINGS ---` / `--- VERDICT ---` dividers in four reviewer defs).
  // Where it happens the body never re-declares model:/tools:/memory:, so every
  // assertion still PASSED. Assumes LF endings and single-line `key: value`
  // frontmatter — both hold for all ten files; a CRLF file fails LOUD, not silently.
  const lines = readFileSync(join(ROOT, `.claude/agents/${name}.md`), 'utf8').split('\n')
  if (lines[0].trim() !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  // Delimiters alone are not enough: with the real closer deleted, the scan runs
  // on to the footer rule every agent file carries and swallows ~190 lines of
  // body. The body never re-declares model:/tools:/memory:, so every assertion
  // still passed. Validate the block's SHAPE — frontmatter is keys, not prose.
  const block = lines.slice(1, end)
  const KEY = /^[A-Za-z_][A-Za-z0-9_-]*\s*:/
  if (!block.every((l) => l.trim() === '' || KEY.test(l))) return null
  return Object.fromEntries(
    block
      .filter((l) => l.includes(':'))
      .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
  )
}

// ── the agent set is closed in both directions ───────────────────────────────
const onDisk = readdirSync(join(ROOT, '.claude/agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
const inSpec = Object.keys(spec.agents)
for (const n of inSpec) if (!onDisk.includes(n)) fail(`${n}: in pipeline.json, no definition file`)
for (const n of onDisk)
  if (!inSpec.includes(n)) fail(`${n}: definition file exists, absent from pipeline.json`)
if (onDisk.length === inSpec.length && inSpec.every((n) => onDisk.includes(n)))
  pass(`agent set matches on both sides (${inSpec.length})`)

// ── pipeline.json's own keys are closed — an unchecked field is the exact
// anti-pattern this file exists to remove (see the commit message: an earlier
// draft carried floors/defer-budget/policy fields no assertion ever touched).
const TOP_LEVEL_KEYS = [
  '_',
  'models',
  'baseTools',
  'writeTools',
  'agents',
  'order',
  'securityPaths',
  'redTeamExtraPaths',
  'coderabbitSyncTriggers',
  'modelLiteralSites',
]
const strayTopKeys = Object.keys(spec).filter((k) => !TOP_LEVEL_KEYS.includes(k))
strayTopKeys.length === 0
  ? pass('pipeline.json has no unchecked top-level keys')
  : fail(`pipeline.json has unchecked top-level key(s): ${strayTopKeys.join(', ')}`)

const AGENT_KEYS = ['model', 'memory', 'write', 'role']
for (const [name, want] of Object.entries(spec.agents)) {
  const strayAgentKeys = Object.keys(want).filter((k) => !AGENT_KEYS.includes(k))
  strayAgentKeys.length === 0
    ? pass(`${name}: no unchecked keys on its agent entry`)
    : fail(`${name}: unchecked key(s) on its agent entry: ${strayAgentKeys.join(', ')}`)
}

// ── each agent's frontmatter matches its declared row ────────────────────────
for (const [name, want] of Object.entries(spec.agents)) {
  if (!onDisk.includes(name)) continue
  const fm = frontmatter(name)
  if (!fm) {
    fail(`${name}: unreadable frontmatter`)
    continue
  }

  const wantModel = spec.models[want.model]
  if (!wantModel) {
    fail(`${name}: unknown model alias "${want.model}"`)
    continue
  }
  fm.model === wantModel
    ? pass(`${name}: model ${wantModel}`)
    : fail(`${name}: model "${fm.model}" != "${wantModel}"`)

  const wantTools = [...spec.baseTools, ...(want.write ? spec.writeTools : [])].join(', ')
  fm.tools === wantTools
    ? pass(`${name}: tools match`)
    : fail(`${name}: tools "${fm.tools}" != "${wantTools}"`)

  const wantMemory = want.memory === 'none' ? undefined : want.memory
  ;(fm.memory ?? undefined) === wantMemory
    ? pass(`${name}: memory ${want.memory}`)
    : fail(`${name}: memory "${fm.memory ?? 'none'}" != "${want.memory}"`)
}

// ── exactly one writer, and it is test-writer ────────────────────────────────
const writers = Object.entries(spec.agents)
  .filter(([, a]) => a.write)
  .map(([n]) => n)
writers.length === 1 && writers[0] === 'test-writer'
  ? pass('exactly one write-capable agent: test-writer')
  : fail(`expected only test-writer to be write-capable; got: ${writers.join(', ') || '(none)'}`)

// ── roles: the "four core agents" phrase is DERIVED, never a literal ─────────
// CLAUDE.md and the rules state "the four core post-commit agents" in prose in
// several places. A count written by hand is the defect class this repo keeps
// hitting; here the membership is the data and the number falls out of it.
const CORE = Object.entries(spec.agents)
  .filter(([, a]) => a.role === 'post-commit-core')
  .map(([n]) => n)
  .sort()
const EXPECTED_CORE = ['code-reviewer', 'doc-updater', 'semantic-reviewer', 'test-writer']
JSON.stringify(CORE) === JSON.stringify(EXPECTED_CORE)
  ? pass(`post-commit-core is exactly: ${CORE.join(', ')} (${CORE.length})`)
  : fail(`post-commit-core is [${CORE.join(', ')}], expected [${EXPECTED_CORE.join(', ')}]`)

// Enum membership alone lets security-auditor be relabelled pre-commit — a false
// claim about when a BLOCKING gate runs — and still pass. The map is the oracle.
const EXPECTED_ROLES = {
  'code-reviewer': 'post-commit-core',
  'semantic-reviewer': 'post-commit-core',
  'doc-updater': 'post-commit-core',
  'test-writer': 'post-commit-core',
  learner: 'post-commit-learner',
  'red-team': 'conditional',
  'coderabbit-sync': 'conditional',
  'plan-critic': 'pre-commit',
  'implementation-critic': 'pre-commit',
  'security-auditor': 'pre-push',
}
for (const [n, a] of Object.entries(spec.agents)) {
  a.role === EXPECTED_ROLES[n]
    ? pass(`${n}: role ${a.role}`)
    : fail(`${n}: role "${a.role}" != expected "${EXPECTED_ROLES[n] ?? '(unknown agent)'}"`)
}

// ── every declared path exists ───────────────────────────────────────────────
for (const p of [...spec.securityPaths, ...spec.redTeamExtraPaths]) {
  existsSync(join(ROOT, p.replace(/\/\*\*$/, '')))
    ? pass(`path exists: ${p}`)
    : fail(`declared path does not exist: ${p}`)
}
for (const t of spec.coderabbitSyncTriggers) {
  if (t.includes('*')) {
    // A glob cannot be existence-checked as written; assert its DIRECTORY is real
    // so a trigger pointing at a renamed folder still fails.
    const dir = t.slice(0, t.lastIndexOf('/'))
    existsSync(join(ROOT, dir))
      ? pass(`coderabbit-sync trigger dir exists: ${dir}/`)
      : fail(`coderabbit-sync trigger dir does not exist: ${dir}/`)
    continue
  }
  existsSync(join(ROOT, t))
    ? pass(`coderabbit-sync trigger exists: ${t}`)
    : fail(`coderabbit-sync trigger does not exist: ${t}`)
}

// ── phase ordering: every consecutive constraint, not a sample ───────────────
const REQUIRED_ORDER = [
  'post-commit-core',
  'fix-loop',
  'post-commit-learner',
  'conditional',
  'spec-tasks',
]
const missing = REQUIRED_ORDER.filter((p) => !spec.order.includes(p))
const extra = spec.order.filter((p) => !REQUIRED_ORDER.includes(p))
if (missing.length) fail(`order is missing phase(s): ${missing.join(', ')}`)
if (extra.length) fail(`order has unknown phase(s): ${extra.join(', ')}`)
if (!missing.length && !extra.length) {
  let ordered = true
  for (let i = 0; i < REQUIRED_ORDER.length - 1; i++) {
    if (spec.order.indexOf(REQUIRED_ORDER[i]) >= spec.order.indexOf(REQUIRED_ORDER[i + 1])) {
      fail(`order: "${REQUIRED_ORDER[i]}" must precede "${REQUIRED_ORDER[i + 1]}"`)
      ordered = false
    }
  }
  if (ordered) pass(`order: ${REQUIRED_ORDER.join(' -> ')}`)
}

// ── files that hardcode a model literal agree with pipeline.json ─────────────
// run-security-auditor.sh is the BLOCKING pre-push gate and is not frontmatter,
// so nothing above reaches it. A model bump that updates pipeline.json and all ten
// agent files would otherwise leave this gate silently running the stale model.
for (const site of spec.modelLiteralSites) {
  if (!existsSync(join(ROOT, site.path))) {
    fail(`modelLiteralSite does not exist: ${site.path}`)
    continue
  }
  const want = spec.models[site.expects]
  if (!want) {
    fail(`${site.path}: unknown model alias "${site.expects}"`)
    continue
  }
  // Bind to the FLAG's own value. Checking that "some known model appears" passes
  // a sonnet->haiku swap on this blocking pre-push gate, and passes a dead comment
  // retaining the old literal while the real flag is broken into a shell variable.
  // Strip `#` comment lines first. Matching raw text lets a dead comment retaining
  // the old literal mask a REMOVED flag — a narrower recurrence of the very hole
  // this check was written to close.
  const raw = readFileSync(join(ROOT, site.path), 'utf8')
  const body = raw
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n')
  const values = [...body.matchAll(new RegExp(`${site.flag}(?:\\s+|=)(\\S+)`, 'g'))].map(
    (m) => m[1],
  )
  if (values.length === 0) fail(`${site.path}: no live \`${site.flag}\` invocation found`)
  else if (values.every((v) => v === want))
    pass(`${site.path}: ${site.flag} is ${want} (${values.length}x)`)
  else
    fail(`${site.path}: ${site.flag} carries ${[...new Set(values)].join(', ')}, expected ${want}`)

  // Also flag any model string in live code that pipeline.json does not know —
  // catches a typo or a dead reference the flag check alone would never see.
  const known = Object.values(spec.models)
  const stray = [...new Set([...body.matchAll(/claude-[a-z0-9.-]+/g)].map((m) => m[0]))].filter(
    (m) => !known.includes(m),
  )
  stray.length === 0
    ? pass(`${site.path}: no unknown model literals`)
    : fail(`${site.path}: unknown model literal(s): ${stray.join(', ')}`)
}

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
