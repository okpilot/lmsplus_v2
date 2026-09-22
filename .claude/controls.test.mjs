#!/usr/bin/env node
// Asserts .claude/pipeline.json's `guards` registry against the repo it describes.
//
// Every guard wired into lefthook.yml, ci.yml, or .claude/settings.json PreToolUse must carry a
// spawned, graded RED and GREEN control (code-style.md §7). This script:
//   (a) derives the wired guard set and checks it against the registry keys, both directions;
//   (b) for each non-exempt entry, checks its `suites` carry >=1 CONTROL: red and
//       >=1 CONTROL: green test;
//   (c) checks every control test carries a `// GROUP:` marker naming
//       `<base>-always-passes` (red) / `<base>-always-blocks` (green), and that those ids
//       exist in `.claude/hooks/<base>.mutations.json`.
//
// Run:  node .claude/controls.test.mjs [root]
//
// NOT `node --test`: this asserts a property of a real checkout, not independent pure-function
// cases.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSuite } from './hooks/run-mutations.mjs'

const ROOT = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')

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

const spec = JSON.parse(readFileSync(join(ROOT, '.claude/pipeline.json'), 'utf8'))
const guards = spec.guards ?? {}
// `_` is a documentation key, never a guard path.
const registeredPaths = Object.keys(guards).filter((k) => k !== '_')

// ---------------------------------------------------------------- (a) derive the wired set

/** Any `.claude/...` path ending in .mjs, .js or .sh, found anywhere in a matched string. */
const CLAUDE_PATH_RE = /\.claude\/[\w./-]+\.(?:mjs|js|sh)/g

/** Every `.claude/` path referenced on a `run:` line in lefthook.yml. */
function fromLefthook(root) {
  const text = readFileSync(join(root, 'lefthook.yml'), 'utf8')
  const found = new Set()
  for (const raw of text.split('\n')) {
    if (!/^\s*run:/.test(raw)) continue
    for (const hit of raw.matchAll(CLAUDE_PATH_RE)) found.add(hit[0])
  }
  return found
}

/**
 * Every `.claude/...` path a ci.yml step runs directly with `node`, excluding `node --test`.
 * Single-line regex only — does not parse folded YAML block scalars.
 */
function fromCi(root) {
  const text = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
  const found = new Set()
  for (const raw of text.split('\n')) {
    const m = /^\s*run:\s*node\s+(\.claude\/\S+)/.exec(raw)
    if (m) found.add(m[1])
  }
  return found
}

/** Every `.claude/...` path in a PreToolUse hook command. A Stop hook blocks nothing. */
function fromSettings(root) {
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'))
  const found = new Set()
  for (const entry of settings.hooks?.PreToolUse ?? []) {
    for (const h of entry.hooks ?? []) {
      for (const hit of String(h.command ?? '').matchAll(CLAUDE_PATH_RE)) found.add(hit[0])
    }
  }
  return found
}

function deriveGuardSet(root) {
  const found = new Set()
  for (const p of fromLefthook(root)) found.add(p)
  for (const p of fromCi(root)) found.add(p)
  for (const p of fromSettings(root)) found.add(p)
  return found
}

const derived = deriveGuardSet(ROOT)
const registered = new Set(registeredPaths)

const unregistered = [...derived].filter((p) => !registered.has(p)).sort()
const undiscoverable = [...registered].filter((p) => !derived.has(p)).sort()

unregistered.length === 0
  ? pass(`every wired guard is registered (${derived.size})`)
  : fail(`wired but not registered in pipeline.json guards: ${unregistered.join(', ')}`)

undiscoverable.length === 0
  ? pass(`every registered guard is actually wired (${registered.size})`)
  : fail(
      `registered in pipeline.json guards but not found wired anywhere: ${undiscoverable.join(', ')}`,
    )

// ---------------------------------------------------------------- (b)+(c) per-guard coverage

/** The `id` set of `.claude/hooks/<base>.mutations.json`, or null if it can't be read. */
function mutationIds(root, base) {
  const path = join(root, '.claude/hooks', `${base}.mutations.json`)
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return new Set((data.mutations ?? []).map((m) => m.id))
  } catch {
    return null
  }
}

/** `base`/`suites` are present and well-shaped; fails and reports directly when not. */
function validEntryShape(guardPath, entry) {
  if (typeof entry.base !== 'string' || entry.base.length === 0) {
    fail(`${guardPath}: registry entry has no \`base\``)
    return false
  }
  if (!Array.isArray(entry.suites) || entry.suites.length === 0) {
    fail(`${guardPath}: registry entry has no \`suites\``)
    return false
  }
  return true
}

/** One suite's CONTROL:red/green problems and tallies, or a single not-found problem. */
function checkSuiteControls(root, suite, base, ids) {
  const suitePath = join(root, suite)
  if (!existsSync(suitePath)) {
    return { problems: [`suite ${suite} does not exist`], redCount: 0, greenCount: 0 }
  }
  const passId = `${base}-always-passes`
  const blockId = `${base}-always-blocks`
  const problems = []
  let redCount = 0
  let greenCount = 0
  const parsed = parseSuite(readFileSync(suitePath, 'utf8'))
  for (const t of parsed.tests) {
    for (const c of t.controls) {
      const wantId = c === 'red' ? passId : blockId
      c === 'red' ? redCount++ : greenCount++
      if (!t.groups.includes(wantId)) {
        problems.push(`${suite}:${t.line}: CONTROL: ${c} has no \`// GROUP: ${wantId}\` marker`)
      } else if (ids !== null && !ids.has(wantId)) {
        problems.push(
          `${suite}:${t.line}: GROUP id "${wantId}" names no mutation in ${base}.mutations.json`,
        )
      }
    }
  }
  return { problems, redCount, greenCount }
}

/** Per-suite CONTROL:red/green coverage problems, plus the counts they were tallied from. */
function collectControlProblems(root, entry, base, ids) {
  const problems = []
  let redCount = 0
  let greenCount = 0
  for (const suite of entry.suites) {
    const r = checkSuiteControls(root, suite, base, ids)
    problems.push(...r.problems)
    redCount += r.redCount
    greenCount += r.greenCount
  }
  if (redCount === 0) problems.push('no CONTROL: red test in any registered suite')
  if (greenCount === 0) problems.push('no CONTROL: green test in any registered suite')
  return { problems, redCount, greenCount }
}

function checkGuardControls(root, guardPath, entry) {
  if (!validEntryShape(guardPath, entry)) return
  const base = entry.base
  const ids = mutationIds(root, base)
  const problems = ids === null ? [`no readable .claude/hooks/${base}.mutations.json`] : []
  const controlResult = collectControlProblems(root, entry, base, ids)
  problems.push(...controlResult.problems)

  problems.length === 0
    ? pass(
        `${guardPath}: ${controlResult.redCount} red + ${controlResult.greenCount} green control(s), linked to ${base}.mutations.json`,
      )
    : fail(`${guardPath}: ${problems.join(' | ')}`)
}

for (const guardPath of registeredPaths) {
  const entry = guards[guardPath]
  if (entry !== null && typeof entry === 'object' && Object.hasOwn(entry, 'exempt')) {
    typeof entry.exempt === 'string' && entry.exempt.length > 0
      ? pass(`${guardPath}: exempt — ${entry.exempt}`)
      : fail(`${guardPath}: \`exempt\` must be a non-empty string`)
    continue
  }
  checkGuardControls(ROOT, guardPath, entry)
}

console.log(`\nResults: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
