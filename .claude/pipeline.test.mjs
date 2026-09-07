#!/usr/bin/env node
// Invariant: .claude/pipeline.json matches the repo it describes.
//
// Every assertion below was an unchecked prose claim before 2026-09-07. The
// pipeline corpus restated each by hand in up to 17 places and nothing caught a
// drift; three independent audits found ~20 contradictions in it. See
// docs/decisions.md Decision 62.
//
// SCOPE — read this before adding a key to pipeline.json. This file asserts ONLY:
// agent set closure, per-agent model/tools/memory, the single-writer invariant,
// existence of every declared path, the phase ordering constraints, and the model
// literal in each site that hardcodes one. A key added to pipeline.json without a
// matching assertion here is an UNCHECKED claim that merely looks tested by sitting
// next to green ones — the exact defect this file exists to remove.
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
  const text = readFileSync(join(ROOT, `.claude/agents/${name}.md`), 'utf8')
  const end = text.indexOf('\n---', 4)
  if (end === -1) return null
  return Object.fromEntries(
    text
      .slice(4, end)
      .split('\n')
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

const KNOWN_ROLES = [
  'post-commit-core',
  'post-commit-learner',
  'conditional',
  'pre-commit',
  'pre-push',
]
for (const [n, a] of Object.entries(spec.agents)) {
  KNOWN_ROLES.includes(a.role)
    ? pass(`${n}: role ${a.role}`)
    : fail(`${n}: unknown role "${a.role}"`)
}

// ── every declared path exists ───────────────────────────────────────────────
for (const p of [...spec.securityPaths, ...spec.redTeamExtraPaths]) {
  existsSync(join(ROOT, p.replace(/\/\*\*$/, '')))
    ? pass(`path exists: ${p}`)
    : fail(`declared path does not exist: ${p}`)
}
for (const t of spec.coderabbitSyncTriggers) {
  if (t.includes('*')) continue
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
  if (!existsSync(join(ROOT, site))) {
    fail(`modelLiteralSite does not exist: ${site}`)
    continue
  }
  const body = readFileSync(join(ROOT, site), 'utf8')
  const known = Object.values(spec.models)
  const found = known.filter((m) => body.includes(m))
  const stray = [...body.matchAll(/claude-[a-z0-9.-]+/g)]
    .map((m) => m[0])
    .filter((m) => !known.includes(m))
  if (!found.length) fail(`${site}: hardcodes no model known to pipeline.json`)
  else if (stray.length)
    fail(`${site}: references unknown model(s): ${[...new Set(stray)].join(', ')}`)
  else pass(`${site}: model literal(s) agree with pipeline.json (${found.join(', ')})`)
}

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
