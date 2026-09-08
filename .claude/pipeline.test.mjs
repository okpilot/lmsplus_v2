#!/usr/bin/env node
// Asserts .claude/pipeline.json against the repo it describes.
// Adding a key to pipeline.json without an assertion here is the defect this file
// removes; the closed-key checks below enforce that mechanically.
// Why each check exists: docs/decisions.md Decision 62, and git log.
//
// Run:  node .claude/pipeline.test.mjs [root]
import { execFileSync } from 'node:child_process'
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

// Lint coverage. Anchored on the FILESYSTEM, not on either declaration: the extensions are
// derived from the files actually present under .claude/, so dropping an extension from the
// lefthook glob fails against what is on disk rather than against a co-modifiable twin.
// Bounded on purpose: it pins coverage of .claude/ ONLY. The glob is repo-wide, so dropping an
// extension that .claude/ happens not to use is a real regression this does NOT catch.
{
  const BIOME_EXTS = ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'jsonc']
  // Enumerated by GIT, not by a walk of our own. Two reasons, and the second is the load-bearing
  // one. (a) There is no recursion of ours left to pin: a hand-rolled walk needs a guard proving it
  // descends, that guard needs a guard, and each one is satisfiable by a walk capped one level
  // deeper. (b) git's set is the one the linter actually uses -- `biome check .claude` skips
  // gitignored files, so a filesystem walk OVER-reports (it picks up .claude/settings.local.json,
  // .gitignore:40) and would demand glob coverage for an extension biome never sees.
  // execFileSync throws on a non-zero exit, so a git failure is loud rather than empty.
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '--', '.claude'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)

  // Pins the ENUMERATION. A mis-scoped pathspec exits 0 with an empty list, which would leave
  // `present` empty and pass every check below against nothing.
  // Two named paths catch narrowing in either direction -- this file for a pathspec narrowed to a
  // subdirectory, the nested one for a pathspec narrowed to the top level. Named paths ALONE are
  // not enough: a pathspec listing exactly those two satisfies both while collapsing `tracked`
  // from every tracked file to 2 (mutation-proven). So the third term is a whole population this
  // file already derives from the FILESYSTEM -- `onDisk`, the .claude/agents/ listing -- which git
  // did not produce and a narrowed pathspec cannot satisfy. An agents file that is untracked fails
  // here too, deliberately: an agent definition outside git is not part of the repo.
  const ANCHORS = ['.claude/pipeline.test.mjs', '.claude/hooks/check-mirror-sync.mjs']
  const unseen = [
    ...ANCHORS.filter((f) => !tracked.includes(f)),
    ...onDisk.map((n) => `.claude/agents/${n}.md`).filter((f) => !tracked.includes(f)),
  ]
  // A finite anchor set is only ever a SAMPLE, and a pathspec can union in exactly the
  // subdirectories the sample covers -- `-- .claude/agents .claude/pipeline.test.mjs
  // .claude/hooks/check-mirror-sync.mjs` satisfies every anchor while dropping .claude/rules/,
  // .claude/commands/, .claude/pipeline.json and the rest -- collapsing 121 tracked files to 12
  // and narrowing the coverage line below from three extensions to one. Before `full` was added
  // that ran fully green; it is what `full` exists to catch. `full` is a second opinion: same
  // command, no pathspec of its own. Chosen over a count floor, which rots and only catches past
  // whatever number someone guessed.
  //
  // WHAT THIS CATCHES: a one-sided narrowing -- the pathspec on `tracked` edited while `full` is
  // left alone. Adding the SAME pathspec to both keeps the two lengths equal and passes; that is
  // mutation-proven, not hypothetical. `full` having no pathspec today is a property of the two
  // lines below, not a guarantee about them.
  //
  // This guard has been rewritten repeatedly, each time after a reviewer defeated the version
  // before it; `.claude/agent-memory/implementation-critic/topics/commit-notes.md` carries the
  // record, including the drafts that were caught before they were ever committed. The durable
  // finding is not any particular guard --
  // it is that a test cannot establish its own enumeration is complete, because the oracle and the
  // subject are the same editable file. What the block below is FOR is the two checks it ends with:
  // the lefthook glob against the extensions actually tracked, and the lint script actually
  // invoking biome. Those pin things that drift on their own. This enumeration guard pins a file
  // someone would have to edit on purpose, and it is worth exactly that much.
  const full = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => f.startsWith('.claude/'))
  if (unseen.length > 0) {
    fail(`git ls-files did not return ${unseen.join(', ')} — the enumeration is broken`)
  } else if (tracked.length !== full.length) {
    fail(
      `pathspec returned ${tracked.length} of ${full.length} tracked .claude/ files — it is narrowed`,
    )
  } else {
    pass(`git enumerates all of .claude/ (${tracked.length} tracked files)`)
  }

  const present = [
    ...new Set(
      tracked.map((n) => n.slice(n.lastIndexOf('.') + 1)).filter((x) => BIOME_EXTS.includes(x)),
    ),
  ].sort()

  // Pins the EXTRACTION. Everything downstream asks only whether `present` is a SUBSET of
  // something, so an extraction returning nothing satisfies all of it: `indexOf('.')` in place of
  // `lastIndexOf('.')`, or `lastIndexOf('/')`, each empties `present` and the suite stays green
  // (mutation-proven). Widening is caught, shrinking is not. This file is itself a tracked .mjs,
  // so `mjs` is in `present` unless the extraction is broken in a way that empties it.
  present.includes('mjs')
    ? pass(`extension extraction reads real suffixes (${present.join(', ')})`)
    : fail(
        `extension extraction produced ${JSON.stringify(present)} — .claude/pipeline.test.mjs is a tracked .mjs, so 'mjs' must be there`,
      )

  const biomeBlock = /\n {4}biome-check:\n([\s\S]*?)(?=\n {4}\S|\n {2}\S)/.exec(lefthook)?.[1] ?? ''
  const glob = /^\s*glob:\s*"([^"]+)"/m.exec(biomeBlock)?.[1]
  if (!glob) fail('lefthook.yml: biome-check has no glob: line')
  else {
    // Exact set membership, never substring: `'*.{jsx}'.includes('js')` is true, so a substring
    // test passes while bare `js` has been dropped from the glob.
    const globExts = new Set((/\{([^}]*)\}/.exec(glob)?.[1] ?? '').split(',').map((x) => x.trim()))
    const missing = present.filter((x) => !globExts.has(x))
    missing.length === 0
      ? pass(
          `lefthook biome-check glob covers every linted extension under .claude/: ${present.join(', ')}`,
        )
      : fail(
          `lefthook biome-check glob "${glob}" misses ${missing.join(', ')} — present under .claude/`,
        )

    // Pins BIOME_EXTS itself. `present` is always a SUBSET of BIOME_EXTS (it's derived by
    // filtering tracked extensions through it), so the `missing` check above can never go red from
    // shrinking BIOME_EXTS -- dropping any entry only shrinks `present` to match, and an empty
    // BIOME_EXTS passes vacuously against an empty `present` (mutation-proven for 'js', 'json',
    // 'mjs' individually and for BIOME_EXTS = []). Assert the reverse direction instead: every
    // extension the glob actually lints must be in BIOME_EXTS, so BIOME_EXTS can't silently drop
    // one out from under the check above.
    const droppedFromBiomeExts = [...globExts].filter((x) => !BIOME_EXTS.includes(x))
    droppedFromBiomeExts.length === 0
      ? pass(`BIOME_EXTS tracks every extension the lefthook glob lints (${BIOME_EXTS.length})`)
      : fail(
          `BIOME_EXTS is missing ${droppedFromBiomeExts.join(', ')} — the lefthook glob lints them but the coverage check above can no longer see them`,
        )
  }

  const lintScript =
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts?.lint ?? ''
  // The INVOCATION, not the mention. Two shapes defeat a weaker check, both mutation-proven: a
  // script that merely NAMES .claude, and one whose biome call sits behind a `#` (npm runs scripts
  // through sh, so nothing after `#` executes — a substring or unanchored regex still matches).
  // So strip comments, split into commands, and require one whose COMMAND WORD is biome.
  const lintsClaude = lintScript
    .replace(/#.*$/gm, '')
    .split(/[;&|]+/)
    .some((cmd) => /^\s*(?:npx\s+|pnpm\s+(?:exec|dlx)\s+)?biome\s+check\b.*\.claude/.test(cmd))
  lintsClaude
    ? pass('root lint script runs biome over .claude (turbo only reaches workspace packages)')
    : fail(`root lint script "${lintScript}" has no biome check over .claude`)
}

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
