#!/usr/bin/env node
// Asserts .claude/pipeline.json's `guards` registry against the repo it describes.
//
// Every guard wired into lefthook.yml, any .github/workflows/*.yml, or any .claude/settings.json
// hook event must carry a spawned, graded RED and GREEN control (code-style.md §7). This script:
//   (a) derives the wired guard set and checks it against the registry keys, both directions;
//   (b) for each non-exempt entry, checks its `suites` carry >=1 CONTROL: red and
//       >=1 CONTROL: green test;
//   (c) checks every control test carries a `// GROUP:` marker naming
//       `<base>-always-passes` (red) / `<base>-always-blocks` (green), that those ids exist in
//       `.claude/hooks/<base>.mutations.json`, that the control's own STRING-LITERAL title is in
//       that mutation's `expectRed`, that the data file's `suites` includes this suite and its
//       `target` equals the guard path, and that the control test is not `.skip`/`.todo`.
//
// Run:  node .claude/controls.test.mjs [root]
//
// NOT `node --test`: this asserts a property of a real checkout, not independent pure-function
// cases.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

/**
 * A `.test.sh`/`.testkit` path reached by something other than a bare `node <path>` step. Bash
 * has no `--test` flag to signal "this is a suite", so for it the filename convention is the
 * only available signal. A `.test.mjs` path is NEVER filename-excluded: `node --test` CONTEXT
 * (see `addBlockPaths`) already removes every suite invocation of one, and two guards in THIS
 * repo — `pipeline.test.mjs`, `controls.test.mjs` (this very file) — are themselves entry points
 * literally named `*.test.mjs`, invoked with a bare `node <path>`; a blanket filename exclusion
 * would silently drop them from the derived set.
 */
function isNonNodeSuitePath(path) {
  return /\.test\.sh$/.test(path) || /\.testkit/.test(path)
}

/** Every `.claude/...` path on a NON-COMMENT line of lefthook.yml — not only `run:` lines, so a
 * multi-line `run: |`/`run: >-` block-scalar CONTINUATION line counts too. */
function fromLefthook(root) {
  const text = readFileSync(join(root, 'lefthook.yml'), 'utf8')
  const found = new Set()
  for (const raw of text.split('\n')) {
    if (/^\s*#/.test(raw)) continue
    for (const hit of raw.matchAll(CLAUDE_PATH_RE)) found.add(hit[0])
  }
  return found
}

/**
 * Every `.claude/...` path EXECUTED by a `run:` step in ANY `.github/workflows/*.yml` file —
 * list-item (`- run: ...`) and two-line step forms, single-line and block-scalar (`run: |`/
 * `run: >-`) bodies, whatever the interpreter prefix (`node`, `bash`, `npx`, `pnpm exec node`, …).
 *
 * EXCLUSION RULE — a path is dropped when EITHER:
 *   (a) the run step's first non-blank content line invokes `node --test` — every following
 *       continuation line in that step is an ARGUMENT to that invocation (a file `--test` loads),
 *       never a step that runs a guard directly; OR
 *   (b) the step's own command is not a bare `node <path>` invocation (e.g. `bash`, `npx`, a
 *       shell wrapper) AND the path's filename matches the graded-suite convention for a runner
 *       with no `--test`-style flag: `*.test.sh` or contains `.testkit` (`isNonNodeSuitePath`).
 * `*.test.mjs` is never filename-excluded — see `isNonNodeSuitePath`'s own doc for why.
 */
function fromCi(root) {
  const dir = join(root, '.github/workflows')
  const found = new Set()
  for (const entry of readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(entry)) continue
    collectRunSteps(readFileSync(join(dir, entry), 'utf8'), found)
  }
  return found
}

const RUN_LINE_RE = /^(\s*)(?:-\s*)?run:[ \t]?(.*)$/
const BLOCK_SCALAR_RE = /^[>|][-+0-9]*\s*(#.*)?$/

/** Walk every `run:` step in a workflow file's text, feeding each one's full body to `addBlockPaths`. */
function collectRunSteps(text, found) {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    if (/^\s*#/.test(raw)) {
      i++
      continue
    }
    const m = RUN_LINE_RE.exec(raw)
    if (!m) {
      i++
      continue
    }
    const [block, next] = readRunBody(lines, i, m[1].length, m[2])
    addBlockPaths(block, found)
    i = next
  }
}

/** Read a `run:` step's body — the rest of its own line, or a block-scalar's indented lines. */
function readRunBody(lines, i, baseIndent, rest) {
  if (!BLOCK_SCALAR_RE.test(rest.trim())) return [[rest], i + 1]
  const collected = []
  let j = i + 1
  while (j < lines.length) {
    const l = lines[j]
    if (l.trim() !== '' && l.length - l.trimStart().length <= baseIndent) break
    collected.push(l)
    j++
  }
  return [collected, j]
}

/** Collect every non-excluded `.claude/...` path in a run step's body. */
function addBlockPaths(block, found) {
  const firstContent = block.find((l) => l.trim() !== '') ?? ''
  if (/^\s*node\s+--test\b/.test(firstContent)) return
  const nodeDirect = /^\s*node\s+(?!--test\b)\S/.test(firstContent)
  for (const raw of block) {
    if (/^\s*#/.test(raw)) continue
    for (const hit of raw.matchAll(CLAUDE_PATH_RE)) {
      if (!nodeDirect && isNonNodeSuitePath(hit[0])) continue
      found.add(hit[0])
    }
  }
}

/** Every `.claude/...` path in a `.claude/settings.json` hook command, across EVERY hook EVENT
 * (`PreToolUse`, `PostToolUse`, `Stop`, …) — a `Stop` hook is not harmless; it can still block. */
function fromSettings(root) {
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'))
  const found = new Set()
  for (const eventEntries of Object.values(settings.hooks ?? {})) {
    for (const entry of eventEntries ?? []) {
      for (const h of entry.hooks ?? []) {
        for (const hit of String(h.command ?? '').matchAll(CLAUDE_PATH_RE)) found.add(hit[0])
      }
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

/** `.claude/hooks/<base>.mutations.json`, parsed, or null if missing/unreadable/malformed. */
function readMutationsData(root, base) {
  const path = join(root, '.claude/hooks', `${base}.mutations.json`)
  if (!existsSync(path)) return null
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(data.mutations) ? data : null
  } catch {
    return null
  }
}

function mutationIdExists(data, id) {
  return data.mutations.some((m) => m.id === id)
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

// A control test's title is its STRING-LITERAL first argument — single- or double-quoted, no
// interpolation. Not extractable → a problem, never silently skipped (§ per titleProblems).
const TITLE_RE = /^\s*(?:test|it)(?:\.\w+)?\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/
function extractTitle(line) {
  const m = TITLE_RE.exec(line)
  return m ? m[2].replace(/\\(['"\\])/g, '$1') : null
}

/** A control written `.skip(`/`.todo(`, or with a `skip:`/`todo:` test-options object, never runs
 * — a declared control, not a graded one. */
function isSkippedLine(line) {
  if (/^\s*(?:test|it)\.(?:skip|todo)\s*\(/.test(line)) return true
  return /\{\s*(?:skip|todo)\s*:/.test(line)
}

/** Whether this suite's `suites`/`target` fields in the data file match the guard under test. */
function suiteRegistrationProblems(suite, base, guardPath, data) {
  const problems = []
  if (!Array.isArray(data.suites) || !data.suites.includes(suite)) {
    problems.push(`${suite}: ${base}.mutations.json \`suites\` does not include this suite`)
  }
  if (data.target !== guardPath) {
    problems.push(
      `${suite}: ${base}.mutations.json \`target\` "${data.target}" does not equal guard path "${guardPath}"`,
    )
  }
  return problems
}

/** Every grading problem for one CONTROL test at `loc`, given the wanted mutation id and data file. */
function controlGradingProblems(loc, line, wantId, data) {
  const problems = []
  if (isSkippedLine(line)) {
    problems.push(`${loc}: control is .skip/.todo — never runs, not a graded control`)
  }
  if (!mutationIdExists(data, wantId)) {
    problems.push(`${loc}: GROUP id "${wantId}" names no mutation in the data file`)
    return problems
  }
  const title = extractTitle(line)
  if (title === null) {
    problems.push(`${loc}: could not extract the control test's string-literal title`)
    return problems
  }
  const m = data.mutations.find((mm) => mm.id === wantId)
  if (!new Set(m.expectRed ?? []).has(title)) {
    problems.push(`${loc}: title "${title}" is not in ${wantId}'s expectRed`)
  }
  return problems
}

/**
 * One suite's CONTROL:red/green problems and tallies, or a single not-found problem.
 *
 * `suites`/`target` are checked only for a suite that actually CARRIES >=1 control test — the
 * data file's `suites` names the suites the mutation harness runs to GRADE controls, which is
 * frequently a strict subset of a guard's full registered `suites` (e.g. `check-commit-claims`
 * registers a plain `.test.mjs` unit suite alongside its `.controls.test.mjs`; only the latter
 * needs to appear in the data file).
 */
function checkSuiteControls(root, suite, base, guardPath, data) {
  const suitePath = join(root, suite)
  if (!existsSync(suitePath)) {
    return { problems: [`suite ${suite} does not exist`], redCount: 0, greenCount: 0 }
  }
  const passId = `${base}-always-passes`
  const blockId = `${base}-always-blocks`
  const problems = []
  let redCount = 0
  let greenCount = 0
  const text = readFileSync(suitePath, 'utf8')
  const lines = text.split('\n')
  const parsed = parseSuite(text)
  for (const t of parsed.tests) {
    for (const c of t.controls) {
      const wantId = c === 'red' ? passId : blockId
      c === 'red' ? redCount++ : greenCount++
      const loc = `${suite}:${t.line}`
      if (!t.groups.includes(wantId)) {
        problems.push(`${loc}: CONTROL: ${c} has no \`// GROUP: ${wantId}\` marker`)
        continue
      }
      if (data === null) continue // "no readable mutations.json" already reported once
      problems.push(...controlGradingProblems(loc, lines[t.line - 1] ?? '', wantId, data))
    }
  }
  if (data !== null && redCount + greenCount > 0) {
    problems.push(...suiteRegistrationProblems(suite, base, guardPath, data))
  }
  return { problems, redCount, greenCount }
}

/** Per-suite CONTROL:red/green coverage problems, plus the counts they were tallied from. */
function collectControlProblems(root, entry, base, guardPath, data) {
  const problems = []
  let redCount = 0
  let greenCount = 0
  for (const suite of entry.suites) {
    const r = checkSuiteControls(root, suite, base, guardPath, data)
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
  const data = readMutationsData(root, base)
  const problems = data === null ? [`no readable .claude/hooks/${base}.mutations.json`] : []
  const controlResult = collectControlProblems(root, entry, base, guardPath, data)
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
