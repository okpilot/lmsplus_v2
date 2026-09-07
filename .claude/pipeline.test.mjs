#!/usr/bin/env node
// Asserts .claude/pipeline.json against the repo it describes.
// Adding a key to pipeline.json without an assertion here is the defect this file
// removes; the closed-key checks below enforce that mechanically.
// Why each check exists: docs/decisions.md Decision 62, and git log.
//
// Run:  node .claude/pipeline.test.mjs [root]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  const lines = readFileSync(join(ROOT, `.claude/agents/${name}.md`), 'utf8').split('\n')
  if (lines[0].trim() !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  const block = lines.slice(1, end)
  const KEY = /^[A-Za-z_][A-Za-z0-9_-]*\s*:/
  if (!block.every((l) => l.trim() === '' || KEY.test(l))) return null
  return Object.fromEntries(
    block
      .filter((l) => l.includes(':'))
      .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
  )
}

const onDisk = readdirSync(join(ROOT, '.claude/agents'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
const inSpec = Object.keys(spec.agents)

for (const n of inSpec)
  if (!onDisk.includes(n)) fail(`declared in pipeline.json, no definition file: ${n}`)
for (const n of onDisk)
  if (!inSpec.includes(n)) fail(`definition file exists, undeclared in pipeline.json: ${n}`)
if (onDisk.length === inSpec.length && inSpec.every((n) => onDisk.includes(n)))
  pass(`agent set is closed in both directions (${inSpec.length})`)

for (const [name, want] of Object.entries(spec.agents)) {
  if (!onDisk.includes(name)) continue
  const fm = frontmatter(name)
  if (!fm) {
    fail(`${name}: frontmatter is not a closed block of key: value lines`)
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

  // Exact-string, deliberately: one canonical spelling, so reordering fails too.
  const wantTools = [...spec.baseTools, ...(want.write ? spec.writeTools : [])].join(', ')
  fm.tools === wantTools
    ? pass(`${name}: tool grant matches the spec`)
    : fail(`${name}: tools "${fm.tools}" != "${wantTools}"`)

  const wantMemory = want.memory === 'none' ? undefined : want.memory
  ;(fm.memory ?? undefined) === wantMemory
    ? pass(`${name}: memory ${want.memory}`)
    : fail(`${name}: memory "${fm.memory ?? 'none'}" != "${want.memory}"`)
}

const FRONTMATTER_KEYS = ['name', 'description', 'model', 'tools', 'memory']
for (const name of onDisk) {
  const fm = frontmatter(name)
  if (!fm) continue
  const stray = Object.keys(fm).filter((k) => !FRONTMATTER_KEYS.includes(k))
  stray.length === 0
    ? pass(`${name}: no unchecked keys in its frontmatter`)
    : fail(`${name}: unchecked frontmatter key(s): ${stray.join(', ')}`)
}

const CORE = Object.entries(spec.agents)
  .filter(([, a]) => a.role === 'post-commit-core')
  .map(([n]) => n)
  .sort()
const EXPECTED_CORE = ['code-reviewer', 'doc-updater', 'semantic-reviewer', 'test-writer']
JSON.stringify(CORE) === JSON.stringify(EXPECTED_CORE)
  ? pass(`post-commit-core is exactly: ${CORE.join(', ')} (${CORE.length})`)
  : fail(`post-commit-core is [${CORE.join(', ')}], expected [${EXPECTED_CORE.join(', ')}]`)

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
const DECLARED_AGENTS = Object.keys(spec.agents).sort()
const EXPECTED_AGENTS = Object.keys(EXPECTED_ROLES).sort()
JSON.stringify(DECLARED_AGENTS) === JSON.stringify(EXPECTED_AGENTS)
  ? pass(
      `agent set is exactly the expected ${EXPECTED_AGENTS.length}: ${EXPECTED_AGENTS.join(', ')}`,
    )
  : fail(`agent set is [${DECLARED_AGENTS.join(', ')}], expected [${EXPECTED_AGENTS.join(', ')}]`)

for (const [n, a] of Object.entries(spec.agents)) {
  a.role === EXPECTED_ROLES[n]
    ? pass(`${n}: role ${a.role}`)
    : fail(`${n}: role "${a.role}" != expected "${EXPECTED_ROLES[n] ?? '(unknown agent)'}"`)
}

const lefthook = readFileSync(join(ROOT, 'lefthook.yml'), 'utf8')
function sectionOf(stage) {
  const idx = lefthook.indexOf(`\n${stage}:`)
  if (idx === -1) return null
  const after = lefthook.slice(idx + 1)
  const bodyStart = after.indexOf('\n') + 1
  const nextTopKey = after.slice(bodyStart).search(/^[A-Za-z_][\w-]*:/m)
  return nextTopKey === -1 ? after : after.slice(0, bodyStart + nextTopKey)
}

function stageCommands(stage) {
  const block = sectionOf(stage)
  if (block === null) return null
  return [...block.matchAll(/^ {4}([A-Za-z_][\w-]*):\s*$/gm)].map((m) => m[1])
}

for (const [stage, expected] of Object.entries(spec.hooks)) {
  const actual = stageCommands(stage)
  if (actual === null) {
    fail(`lefthook.yml has no ${stage}: block`)
    continue
  }
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
    ? pass(`lefthook.yml ${stage}: runs exactly ${[...expected].sort().join(', ')}`)
    : fail(
        `lefthook.yml ${stage}: runs [${actual.join(', ')}], spec declares [${expected.join(', ')}]`,
      )
}

const prePushCommands = stageCommands('pre-push') ?? []

// The stage set is DERIVED from lefthook.yml — a top-level key whose block declares
// `commands:` is a stage — and compared both ways, so a stage dropped from the spec
// stops being checked LOUDLY rather than silently.
const lefthookStages = [...lefthook.matchAll(/^([A-Za-z_][\w-]*):(?:\s*#.*)?$/gm)]
  .map((m) => m[1])
  .filter((k) => sectionOf(k) !== null && /^ {2}commands:\s*$/m.test(sectionOf(k)))
  .sort()
const declaredStages = Object.keys(spec.hooks).sort()
JSON.stringify(lefthookStages) === JSON.stringify(declaredStages)
  ? pass(`spec.hooks covers every lefthook.yml stage: ${lefthookStages.join(', ')}`)
  : fail(
      `lefthook.yml stages [${lefthookStages.join(', ')}] != spec.hooks [${declaredStages.join(', ')}]`,
    )

const declaredPrePush = inSpec.filter((n) => spec.agents[n].role === 'pre-push').sort()
const actualPrePush = inSpec.filter((n) => prePushCommands.includes(n)).sort()
JSON.stringify(declaredPrePush) === JSON.stringify(actualPrePush)
  ? pass(`role: pre-push agrees with lefthook.yml (${actualPrePush.join(', ') || 'none'})`)
  : fail(
      `role: pre-push declares [${declaredPrePush.join(', ')}], lefthook.yml runs [${actualPrePush.join(', ')}]`,
    )

const writers = Object.entries(spec.agents)
  .filter(([, a]) => a.write)
  .map(([n]) => n)
writers.length === 1 && writers[0] === 'test-writer'
  ? pass('exactly one write-capable agent: test-writer')
  : fail(`expected only test-writer to be write-capable; got: ${writers.join(', ') || '(none)'}`)

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
  'hooks',
]
const strayTopKeys = Object.keys(spec).filter((k) => !TOP_LEVEL_KEYS.includes(k))
strayTopKeys.length === 0
  ? pass('pipeline.json has no unchecked top-level keys')
  : fail(`pipeline.json has unchecked top-level key(s): ${strayTopKeys.join(', ')}`)

const AGENT_KEYS = ['model', 'memory', 'write', 'role']
for (const [name, want] of Object.entries(spec.agents)) {
  const stray = Object.keys(want).filter((k) => !AGENT_KEYS.includes(k))
  stray.length === 0
    ? pass(`${name}: no unchecked keys on its agent entry`)
    : fail(`${name}: unchecked key(s) on its agent entry: ${stray.join(', ')}`)
}

const usedAliases = new Set([
  ...Object.values(spec.agents).map((a) => a.model),
  ...spec.modelLiteralSites.map((s) => s.expects),
])
const unusedAliases = Object.keys(spec.models).filter((k) => !usedAliases.has(k))
unusedAliases.length === 0
  ? pass('every model alias is referenced by an agent or a model-literal site')
  : fail(`unreferenced model alias(es): ${unusedAliases.join(', ')}`)

for (const p of [...spec.securityPaths, ...spec.redTeamExtraPaths]) {
  existsSync(join(ROOT, p.replace(/\/\*\*$/, '')))
    ? pass(`declared path exists: ${p}`)
    : fail(`declared path does not exist: ${p}`)
}

for (const t of spec.coderabbitSyncTriggers) {
  if (t.includes('*')) {
    const dir = t.slice(0, t.lastIndexOf('/'))
    existsSync(join(ROOT, dir))
      ? pass(`glob trigger's directory exists: ${dir}/`)
      : fail(`glob trigger's directory does not exist: ${dir}/`)
    continue
  }
  existsSync(join(ROOT, t))
    ? pass(`coderabbit-sync trigger exists: ${t}`)
    : fail(`coderabbit-sync trigger does not exist: ${t}`)
}

const REQUIRED_ORDER = [
  'post-commit-core',
  'fix-loop',
  'post-commit-learner',
  'conditional',
  'spec-tasks',
]
const missing = REQUIRED_ORDER.filter((p) => !spec.order.includes(p))
const extra = spec.order.filter((p) => !REQUIRED_ORDER.includes(p))
const dupes = spec.order.filter((p, i) => spec.order.indexOf(p) !== i)
if (dupes.length) fail(`order repeats phase(s): ${[...new Set(dupes)].join(', ')}`)
if (missing.length) fail(`order is missing phase(s): ${missing.join(', ')}`)
if (extra.length) fail(`order has unknown phase(s): ${extra.join(', ')}`)
if (!missing.length && !extra.length && !dupes.length) {
  let ordered = true
  for (let i = 0; i < REQUIRED_ORDER.length - 1; i++) {
    if (spec.order.indexOf(REQUIRED_ORDER[i]) >= spec.order.indexOf(REQUIRED_ORDER[i + 1])) {
      fail(`order: "${REQUIRED_ORDER[i]}" must precede "${REQUIRED_ORDER[i + 1]}"`)
      ordered = false
    }
  }
  if (ordered) pass(`phase order: ${REQUIRED_ORDER.join(' -> ')}`)
}

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
  const body = readFileSync(join(ROOT, site.path), 'utf8')
    .split('\n')
    .map((l) => (l.trimStart().startsWith('#') ? '' : l.replace(/\s#.*$/, '')))
    .join('\n')

  const values = [...body.matchAll(new RegExp(`${escapeRe(site.flag)}(?:\\s+|=)(\\S+)`, 'g'))].map(
    (m) => m[1],
  )
  if (values.length === 0) fail(`${site.path}: no live \`${site.flag}\` invocation found`)
  else if (values.every((v) => v === want))
    pass(`${site.path}: live \`${site.flag}\` pins ${want} (${values.length}x)`)
  else
    fail(`${site.path}: ${site.flag} carries ${[...new Set(values)].join(', ')}, expected ${want}`)

  const known = Object.values(spec.models)
  const stray = [
    ...new Set([...body.matchAll(/claude-[a-z]+(?:-[a-z0-9]+)*-\d[a-z0-9-]*/g)].map((m) => m[0])),
  ].filter((m) => !known.includes(m))
  stray.length === 0
    ? pass(`${site.path}: no model literals the spec does not know`)
    : fail(`${site.path}: unknown model literal(s): ${stray.join(', ')}`)
}

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
