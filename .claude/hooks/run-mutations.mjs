#!/usr/bin/env node

// Mutation harness: make "N mutations run, N caught" RE-DERIVABLE.
//
// Commit messages in this repo assert that figure for the `.claude/hooks/*.mjs` guards.
// Reviewers flagged it as unverifiable TWICE, and both times they were right: the mutations
// existed only inside a scratch directory that `test-writer.md`'s protocol requires to be
// DESTROYED. The evidence and the requirement to discard it were the same artifact, so the
// claim could never be re-run. This harness stores the mutations as DATA
// (`<guard>.mutations.json`) and applies them at runtime to a throwaway git worktree, so the
// number is reproduced by executing a command rather than by trusting a sentence.
//
// Usage:  node .claude/hooks/run-mutations.mjs                  run every mutation
//         node .claude/hooks/run-mutations.mjs --guard <base>   run one data file
//         node .claude/hooks/run-mutations.mjs --list           print ids, run nothing
//         node .claude/hooks/run-mutations.mjs --coverage       claims vs encoded vs gap
//         [--scratch <dir>]                                     where worktrees are made
//
// Exit:   0 = every encoded mutation was CAUGHT
//         1 = at least one SURVIVED or MISMATCHed — a finding about the TESTS
//         2 = the harness COULD NOT RUN — a finding about the HARNESS
//
// Why 1 and 2 are separate. A mutation reports SURVIVED when the suites stayed green, and
// `code-style.md` §7 names the trap directly: "a `sed` whose anchor does not match is a no-op,
// and a no-op mutation is indistinguishable from an unpinned test — it reports SURVIVED either
// way". If a broken harness — an anchor that no longer matches after the guard was refactored,
// a git failure, a TAP stream this cannot parse — also exited 1, every one of those would be
// read as "that test pins nothing", and the cheapest remedy for a reader is to DELETE THE TEST.
// The harness would then have destroyed the coverage it exists to measure. Exit 2 says "no
// verdict was reached"; exit 1 says "a verdict was reached and it is bad". Do not unify them.
//
// Bounds, stated because understating them would be this tool's own defect:
//   - it grades only what is ENCODED. A `MUTATION:` comment nobody translated into a data entry
//     is invisible to the run and visible only under `--coverage`, which is why that mode exists;
//   - `expectRed` is compared as an EXACT SET. A mutation that reddens a superset of the named
//     tests is reported MISMATCH, not CAUGHT — §7 calls a comment naming fewer tests than it
//     actually breaks "under-specific", and silently passing it would launder that defect;
//   - the worktree is built from HEAD, so an UNCOMMITTED edit to a target or a suite is not what
//     gets graded. The run measures the committed tree; that is what a commit message claims about.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MAX_BUFFER = 64 * 1024 * 1024

/** Per-mutation suite budget. A hanging break must fail the harness, never stall it. */
const SUITE_TIMEOUT_MS = 120_000

/** Mode flags. Options (`--guard`, `--scratch`) take a value and are NOT modes. */
const MODE_FLAGS = new Set(['--list', '--coverage'])
const OPTION_FLAGS = new Set(['--guard', '--scratch'])

const DATA_SUFFIX = '.mutations.json'

// ---------------------------------------------------------------- pure helpers

/**
 * Parse one TAP stream into its test points.
 *
 * Depth comes from the leading indentation: `node --test` indents a subtest by four spaces per
 * level and emits CHILDREN BEFORE their parent, so a nested failure produces both the child's
 * `not ok` and an aggregate `not ok` for the parent that merely propagates it. Counting the
 * aggregate as a failure would make an exact-set comparison against `expectRed` unsatisfiable
 * for any suite using subtests, so `failed` reports LEAVES only — see `isAggregate`.
 *
 * THROWS on a stream carrying no plan line. That is the "harness could not run" case (a crashed
 * runner, a truncated pipe), and it must not be confused with "nothing failed": a zero-length
 * stream and a fully green run would otherwise be the same observation.
 */
export function parseTap(text) {
  const points = []
  let sawPlan = false
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '')
    const indent = line.length - line.trimStart().length
    const body = line.trimStart()
    if (/^\d+\.\.\d+$/.test(body)) {
      if (indent === 0) sawPlan = true
      continue
    }
    const m = /^(not )?ok(?:\s+(\d+))?(?:\s+-)?\s*(.*)$/.exec(body)
    if (!m) continue
    let name = m[3].trim()
    let directive = null
    // A TAP directive suffixes the description. `# TODO` marks an EXPECTED failure, so a
    // `not ok ... # TODO` is not a red test; `# SKIP` never ran at all. Folding either into
    // the failing set invents a catch the mutation did not earn.
    const d = /\s*#\s*(SKIP|TODO)\b(.*)$/i.exec(name)
    if (d) {
      directive = d[1].toUpperCase()
      name = name.slice(0, d.index).trim()
    }
    points.push({
      ok: !m[1],
      number: m[2] ? Number(m[2]) : null,
      name,
      depth: Math.floor(indent / 4),
      directive,
    })
  }
  if (!sawPlan) {
    throw new Error('TAP stream carried no top-level plan line (1..N) — the run did not complete')
  }
  const failed = points
    .filter(
      (p, i) =>
        !p.ok && p.directive !== 'TODO' && p.directive !== 'SKIP' && !isAggregate(points, i),
    )
    .map((p) => p.name)
  return { points, failed, plan: sawPlan }
}

/**
 * Does point `i` fail only because a child of it failed? Children precede their parent and sit
 * one level deeper, so walk backwards over the contiguous deeper block that belongs to it.
 */
function isAggregate(points, i) {
  const { depth } = points[i]
  for (let j = i - 1; j >= 0; j--) {
    if (points[j].depth <= depth) return false
    // BOTH halves of this comparison must treat directives identically — `code-style.md` §7,
    // "Both Halves of a Two-Sided Gate Must Compare Tokens the Same Way". The `failed` filter
    // above excludes SKIP; when this one did not, a parent failing in its own body with a single
    // `not ok ... # SKIP` child was dropped as an aggregate AND the child was dropped as skipped,
    // leaving `failed` empty — SURVIVED reported while a test was red. Caught by CR-local, on a
    // rule promoted from this branch family and then broken by fixing only one side of it.
    if (!points[j].ok && points[j].directive !== 'TODO' && points[j].directive !== 'SKIP') {
      return true
    }
  }
  return false
}

/**
 * Classify one mutation's outcome.
 *
 * SURVIVED  — nothing went red. Either the test pins nothing, or the mutation was a no-op.
 * CAUGHT    — the failing set is EXACTLY `expectRed`.
 * MISMATCH  — anything else, INCLUDING a strict superset. `code-style.md` §7: a comment naming
 *             fewer tests than the break actually reddens is under-specific, and "a superset
 *             means the comment is under-specific" is the rule's own wording. Reporting that as
 *             CAUGHT would mean the harness certifies the exact claim §7 forbids.
 */
export function compareResult(expectRed, failedNames) {
  const expected = [...new Set(expectRed)]
  const actual = [...new Set(failedNames)]
  if (actual.length === 0) return { status: 'SURVIVED', missing: expected, unexpected: [] }
  const missing = expected.filter((n) => !actual.includes(n))
  const unexpected = actual.filter((n) => !expected.includes(n))
  if (missing.length === 0 && unexpected.length === 0) {
    return { status: 'CAUGHT', missing: [], unexpected: [] }
  }
  return { status: 'MISMATCH', missing, unexpected }
}

/**
 * How many `MUTATION:` claims does this text make?
 *
 * The pattern is `MUTATION:` and NOT `// MUTATION:`. `code-style.md` §7 records the measurement:
 * "some claims sit mid-line after other prose and the narrower pattern silently misses them",
 * and that the two greps answer different questions. Narrowing this would under-count the
 * denominator of the coverage ratio — the one number this mode exists to produce.
 */
export function countMutationClaims(text) {
  return (String(text).match(/MUTATION:/g) ?? []).length
}

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0

/** Structural validation of one data file. Returns problem strings; empty means usable. */
export function validateDataFile(obj, label = '<data>') {
  const problems = []
  const at = (s) => `${label}: ${s}`
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [at('top level must be an object')]
  }
  if (!isNonEmptyString(obj.target)) problems.push(at('`target` must be a non-empty string'))
  if (!Array.isArray(obj.suites) || obj.suites.length === 0) {
    problems.push(at('`suites` must be a non-empty array'))
  } else if (!obj.suites.every(isNonEmptyString)) {
    problems.push(at('every `suites` entry must be a non-empty string'))
  }
  // CONTAINMENT. An earlier version rejected only ABSOLUTE paths, under the false premise that
  // `join(root, '/etc/passwd')` yields '/etc/passwd'. It does not — that is `resolve`. `join`
  // gives '<root>/etc/passwd', which is contained and harmless. The real escape is a PARENT
  // TRAVERSAL: `join(root, '../../etc/x')` IS '/etc/x', and `isAbsolute('../x')` is false, so the
  // old guard let precisely the dangerous shape through while blocking the safe one. Measured,
  // not reasoned. Applies to `suites` too: they are handed to `node --test` with cwd=worktree, so
  // one resolving outside it runs the HOST suite against UNMUTATED code — a false SURVIVED.
  for (const [label, val] of [
    ['target', obj.target],
    ...(Array.isArray(obj.suites) ? obj.suites.map((sv, i) => [`suites[${i}]`, sv]) : []),
  ]) {
    if (typeof val !== 'string' || val.length === 0) continue
    if (isAbsolute(val) || val.split(/[\\/]/).includes('..')) {
      problems.push(
        at(`\`${label}\` must stay inside the worktree — no absolute path, no '..' segment`),
      )
    }
  }
  if (!Array.isArray(obj.mutations)) {
    problems.push(at('`mutations` must be an array'))
  } else if (obj.mutations.length === 0) {
    // Same false-green as the no-data-files case, one level down, and asymmetric with `suites`
    // which is already length-checked: an empty list runs no mutation and reports success.
    problems.push(at('`mutations` must not be empty — an empty list grades nothing'))
  } else {
    const seen = new Set()
    obj.mutations.forEach((mut, i) => {
      const w = (s) => problems.push(at(`mutations[${i}]${mut?.id ? ` (${mut.id})` : ''}: ${s}`))
      if (mut === null || typeof mut !== 'object' || Array.isArray(mut)) {
        w('must be an object')
        return
      }
      if (!isNonEmptyString(mut.id)) w('`id` must be a non-empty string')
      else if (seen.has(mut.id)) w('duplicate `id`')
      else seen.add(mut.id)
      // An empty `find` matches everywhere and an empty `replace` is a legitimate deletion —
      // so the two are NOT validated the same way. Conflating them would let a mutation whose
      // anchor is '' pass the exactly-once check vacuously on any non-empty file.
      if (!isNonEmptyString(mut.find)) w('`find` must be a non-empty string')
      if (typeof mut.replace !== 'string') w('`replace` must be a string (may be empty)')
      if (!Array.isArray(mut.expectRed) || mut.expectRed.length === 0) {
        w('`expectRed` must be a non-empty array of test names')
      } else if (!mut.expectRed.every(isNonEmptyString)) {
        w('every `expectRed` entry must be a non-empty string')
      }
    })
  }
  if (obj.notEncoded !== undefined) {
    if (!Array.isArray(obj.notEncoded)) problems.push(at('`notEncoded` must be an array'))
    else {
      obj.notEncoded.forEach((n, i) => {
        if (
          n === null ||
          typeof n !== 'object' ||
          !isNonEmptyString(n.claim) ||
          !isNonEmptyString(n.why)
        ) {
          problems.push(at(`notEncoded[${i}] must carry a non-empty \`claim\` and \`why\``))
        }
      })
    }
  }
  return problems
}

/**
 * Assert the anchor is unique in `source`. THROWS otherwise, naming the id and the count.
 *
 * This is the whole reason the harness can be believed. §7: "A `sed` whose anchor does not match
 * is a no-op, and a no-op mutation is indistinguishable from an unpinned test — it reports
 * SURVIVED either way." Zero occurrences is a stale data file; two or more means the replacement
 * lands somewhere unintended, and the verdict describes a break nobody wrote.
 */
export function assertSingleOccurrence(source, find, id) {
  const count = source.split(find).length - 1
  if (count !== 1) {
    throw new Error(
      `mutation ${id}: anchor occurs ${count} time(s) in the target, expected exactly 1 — ` +
        (count === 0
          ? 'the data file is stale against HEAD (a no-op mutation reports SURVIVED)'
          : 'the anchor is ambiguous; extend it until it is unique'),
    )
  }
  return count
}

/** Parse argv. Returns `{ error }` or `{ mode, guard, scratch }`. */
export function parseArgs(args) {
  const modes = []
  const opts = { guard: null, scratch: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('--')) {
      // A bare positional is never meaningful here, and accepting one is how a flag typo
      // (`-list`) becomes a silently ignored argument on a run that then reports green.
      return { error: `unexpected argument ${JSON.stringify(a)} — this tool takes flags only` }
    }
    if (MODE_FLAGS.has(a)) {
      modes.push(a)
      continue
    }
    if (OPTION_FLAGS.has(a)) {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        return { error: `${a} requires a value` }
      }
      opts[a.slice(2)] = value
      i++
      continue
    }
    return { error: `unknown flag ${a}` }
  }
  // Two modes both pass the unknown-flag gate, then whichever branch is tested first wins and
  // the other request is dropped with no diagnostic at exit 0 — the collision
  // `check-file-size-guard.mjs` documents at its own arg parser. Precedence between modes is
  // not a thing to guess at.
  if (new Set(modes).size > 1) {
    return { error: `${[...new Set(modes)].join(' and ')} are separate modes — run one` }
  }
  return {
    mode: modes.length === 0 ? 'run' : modes[0].slice(2),
    guard: opts.guard,
    scratch: opts.scratch,
  }
}

// ---------------------------------------------------------------- git-facing

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, maxBuffer: MAX_BUFFER, encoding: 'utf8' })
  if (r.error) throw r.error
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim()}`)
  }
  return r.stdout
}

const repoRoot = () => git(['rev-parse', '--show-toplevel']).trim()

/** Data files present in `.claude/hooks`, sorted, as `{ basename, path }`. */
function dataFiles(root) {
  const dir = join(root, '.claude', 'hooks')
  return readdirSync(dir)
    .filter((f) => f.endsWith(DATA_SUFFIX))
    .sort()
    .map((f) => ({ basename: f.slice(0, -DATA_SUFFIX.length), path: join(dir, f) }))
}

function loadDataFile(file) {
  let obj
  try {
    obj = JSON.parse(readFileSync(file.path, 'utf8'))
  } catch (err) {
    throw new Error(`${file.path}: unreadable or malformed JSON — ${err.message}`)
  }
  const problems = validateDataFile(obj, file.path)
  if (problems.length > 0) throw new Error(problems.join('\n  '))
  return obj
}

/**
 * Where worktrees are made. NEVER inside the repo: a worktree under the repo root would be
 * walked by the very guards under test (and by lint, and by the file-size ratchet), so a run
 * would change what the next run measures.
 */
function scratchBase(root, requested) {
  const base = requested ? resolve(requested) : tmpdir()
  if (base === root || base.startsWith(root + sep)) {
    throw new Error(`--scratch must be outside the repository (got ${base} under ${root})`)
  }
  return base
}

/**
 * Apply ONE mutation in a throwaway worktree and report the verdict.
 *
 * The ordering is the point: create the worktree, assert the anchor is unique, write, run,
 * compare, and remove the worktree in `finally` so cleanup survives a throw. A leaked worktree
 * is a documented bypass class in `.claude/agents/test-writer.md` — it keeps the mutated code
 * on disk while the primary repo's status, HEAD and stash list are all blind to it.
 */
function runMutation({ root, data, mut, base }) {
  const wt = mkdtempSync(join(base, 'run-mutations-'))
  try {
    git(['worktree', 'add', '--detach', wt, 'HEAD'], root)
    const targetPath = join(wt, data.target)
    let source
    try {
      source = readFileSync(targetPath, 'utf8')
    } catch (err) {
      throw new Error(`mutation ${mut.id}: cannot read target ${data.target} — ${err.message}`)
    }
    assertSingleOccurrence(source, mut.find, mut.id)
    // A FUNCTION replacer is required. With a string pattern, `$&`, `$'`, `` $` `` and `$$` in
    // the REPLACEMENT are still expanded, so a mutation whose replacement code contains any of
    // them would write text the data file does not declare — while assertSingleOccurrence had
    // just reported a clean single match. The verdict would then describe a break nobody wrote.
    writeFileSync(
      targetPath,
      source.replace(mut.find, () => mut.replace),
      'utf8',
    )

    // cwd is the WORKTREE ROOT, not the suite's directory: the suites resolve
    // `.claude/limits.json` by a CWD-relative path and fail with ENOENT from anywhere else.
    const r = spawnSync('node', ['--test', '--test-reporter=tap', ...data.suites], {
      cwd: wt,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      // `node --test` applies no default per-test timeout, so a mutation that produces an
      // unbounded loop would block until CI killed the job — no verdict, no partial report.
      // Not hypothetical: `check-file-size-guard.mutations.json` records a break that HANGS,
      // which is why that entry encodes a return flip instead. The kill surfaces as `error` or
      // `signal`, and both route to exit 2 — a harness failure, never a test verdict.
      timeout: SUITE_TIMEOUT_MS,
      // SIGKILL, not the SIGTERM default: `spawnSync` keeps WAITING when the child handles the
      // signal without exiting, so an interceptable kill turns the bound above into a
      // suggestion. Today's suites are bare `node --test` and trap nothing — the point is that
      // the budget must hold for a suite that DOES, since a stall reports no verdict at all.
      killSignal: 'SIGKILL',
    })
    if (r.error) throw new Error(`mutation ${mut.id}: could not spawn node — ${r.error.message}`)
    if (r.signal) {
      throw new Error(
        `mutation ${mut.id}: suite run killed by ${r.signal} (timeout ${SUITE_TIMEOUT_MS}ms) — NO VERDICT`,
      )
    }
    let tap
    try {
      tap = parseTap(r.stdout ?? '')
    } catch (err) {
      throw new Error(`mutation ${mut.id}: ${err.message}\n${(r.stderr || '').trim()}`)
    }
    return { id: mut.id, ...compareResult(mut.expectRed, tap.failed), failed: tap.failed }
  } finally {
    // --force because the tree is dirty by construction: we just mutated a tracked file in it.
    try {
      git(['worktree', 'remove', '--force', wt], root)
    } catch {
      // Best effort; the prune keeps the primary repo's worktree list from accumulating
      // stale administrative entries even if the directory removal lost a race.
      try {
        git(['worktree', 'prune'], root)
      } catch {
        /* nothing further this process can do; the real error is the one being thrown */
      }
    }
  }
}

function selectFiles(root, guard) {
  const all = dataFiles(root)
  if (!guard) return all
  const hit = all.filter((f) => f.basename === guard || f.basename === guard.replace(/\.mjs$/, ''))
  if (hit.length === 0) {
    throw new Error(
      `no data file for --guard ${guard} (looked for .claude/hooks/${guard}${DATA_SUFFIX})`,
    )
  }
  return hit
}

function modeList(root, guard) {
  const files = selectFiles(root, guard)
  if (files.length === 0) console.log('no *.mutations.json data files found')
  for (const file of files) {
    const data = loadDataFile(file)
    console.log(`${file.basename}${DATA_SUFFIX}  → ${data.target}`)
    for (const mut of data.mutations) console.log(`  ${mut.id}`)
    for (const n of data.notEncoded ?? []) console.log(`  (not encoded) ${n.claim}`)
  }
  return 0
}

function modeCoverage(root, guard) {
  const files = selectFiles(root, guard)
  if (files.length === 0) console.log('no *.mutations.json data files found')
  for (const file of files) {
    const data = loadDataFile(file)
    let claims = 0
    for (const suite of data.suites) {
      const p = isAbsolute(suite) ? suite : join(root, suite)
      claims += countMutationClaims(readFileSync(p, 'utf8'))
    }
    const encoded = data.mutations.length
    const notEncoded = (data.notEncoded ?? []).length
    console.log(`${file.basename}${DATA_SUFFIX}`)
    console.log(`  MUTATION: claims across suites : ${claims}`)
    console.log(`  encoded mutations             : ${encoded}`)
    console.log(`  declared not-encodable        : ${notEncoded}`)
    console.log(`  gap (unaccounted claims)      : ${claims - encoded - notEncoded}`)
  }
  return 0
}

function modeRun(root, guard, scratch) {
  const files = selectFiles(root, guard)
  if (files.length === 0) {
    // NOT exit 0. Exit 0 asserts "every encoded mutation was CAUGHT"; a run that graded NOTHING
    // has earned no such claim. A data file emptied, renamed, or moved out of `.claude/hooks/`
    // would otherwise turn this oracle permanently green while checking nothing — the precise
    // failure mode the tool exists to detect in other people's tests.
    throw new Error('no *.mutations.json data files found — nothing graded, so no verdict')
  }
  const base = scratchBase(root, scratch)
  let caught = 0
  let bad = 0
  let total = 0
  for (const file of files) {
    const data = loadDataFile(file)
    console.log(`\n${file.basename}${DATA_SUFFIX}  → ${data.target}`)
    for (const mut of data.mutations) {
      total++
      const res = runMutation({ root, data, mut, base })
      if (res.status === 'CAUGHT') {
        caught++
        console.log(`  CAUGHT    ${mut.id}`)
        continue
      }
      bad++
      console.log(`  ${res.status.padEnd(9)} ${mut.id}`)
      console.log(`    expected red : ${mut.expectRed.join(' | ') || '(none)'}`)
      console.log(
        `    actually red : ${res.failed.join(' | ') || '(none — the suites were green)'}`,
      )
      if (res.missing.length > 0) console.log(`    never went red: ${res.missing.join(' | ')}`)
      if (res.unexpected.length > 0) {
        console.log(
          `    also went red: ${res.unexpected.join(' | ')} — the claim is under-specific`,
        )
      }
    }
  }
  console.log(`\n${total} mutations run, ${caught} caught, ${bad} survived-or-mismatched`)
  return bad === 0 ? 0 : 1
}

export function main(args) {
  const parsed = parseArgs(args)
  if (parsed.error) {
    console.error(`✖ mutation harness: ${parsed.error} — BLOCKING`)
    console.error(
      '  usage: run-mutations.mjs [--list | --coverage] [--guard <basename>] [--scratch <dir>]',
    )
    // Said here, not only in the file header, because the people who need it are authoring
    // `<guard>.mutations.json` and will never open this source file.
    console.error(
      '  data files: `expectRed` is compared as an EXACT SET — list EVERY test the break reddens,',
    )
    console.error(
      '  not just the one its MUTATION: comment names. A superset reports MISMATCH, not CAUGHT.',
    )
    return 2
  }
  const root = repoRoot()
  if (parsed.mode === 'list') return modeList(root, parsed.guard)
  if (parsed.mode === 'coverage') return modeCoverage(root, parsed.guard)
  return modeRun(root, parsed.guard, parsed.scratch)
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    // Fail CLOSED at 2, never 1: see the exit-code rationale in the header. A harness fault
    // reported as a test finding gets remedied by deleting the test.
    console.error(`✖ mutation harness: could not run — NO VERDICT: ${err.message}`)
    console.error('  This is a harness/environment failure, NOT evidence that a test is unpinned.')
    exit(2)
  }
}
