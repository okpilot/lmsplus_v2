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
//         node .claude/hooks/run-mutations.mjs --coverage       claim sites vs encoded mutations
//         node .claude/hooks/run-mutations.mjs --update-expected rewrite every MISMATCHed
//                                                               `expectRed` from what went red
//         node .claude/hooks/run-mutations.mjs --staged         grade the INDEX, not HEAD —
//                                                               scoped to data files that touch
//                                                               what is staged (plain run only)
//         [--jobs N]                                            run up to N mutations concurrently
//                                                               (default 1). Output, exit code and
//                                                               `onResult` order are IDENTICAL for
//                                                               any N — see `runPool`. Not valid
//                                                               with `--list`/`--coverage`.
//         [--scratch <dir>]                                     where worktrees are made
//
// `--staged` exists because a pre-commit gate built on the plain run grades the last COMMIT: a
// file only staged, not yet committed, reports NO VERDICT rather than a result. It builds a
// commit of the INDEX tree without moving HEAD or touching the worktree (`git write-tree` +
// `git commit-tree -p HEAD`), grades THAT, and narrows to the data files whose target, suites,
// own path, or a file TRANSITIVELY reachable from the target or a suite by import (or by literal
// path from a file reached from a suite) is actually staged. `touchesStaged` is the predicate;
// the runtime message names the same set.
//
// Exit:   0 = every encoded mutation was CAUGHT
//         1 = at least one SURVIVED or MISMATCHed — a finding about the TESTS
//         2 = NO TRUSTWORTHY VERDICT — a finding about the HARNESS. Covers a fault in ANY
//             single mutation (the batch still grades the rest and reports how many it could
//             not), and the cases with nothing to grade at all — EXCEPT one: under `--staged`,
//             a staged set touching no data file, target, suite, or reachable import/literal
//             exits 0. That is a commit
//             this tool has no claim to grade, not a harness that lost its corpus, and the
//             `files.length === 0` throw below still covers the corpus going missing.
//
// Why 1 and 2 are separate. A mutation reports SURVIVED when the suites stayed green, and
// `code-style.md` §7 names the trap directly: "a `sed` whose anchor does not match is a no-op,
// and a no-op mutation is indistinguishable from an unpinned test — it reports SURVIVED either
// way". If a broken harness — an anchor that no longer matches after the guard was refactored,
// a git failure, a TAP stream this cannot parse — also exited 1, every one of those would be
// read as "that test pins nothing", and the cheapest remedy for a reader is to DELETE THE TEST.
// The harness would then have destroyed the coverage it exists to measure. Exit 2 says "no
// verdict was reached"; exit 1 says "a verdict was reached and it is bad". Do not unify them.
// A fault no longer stops the batch: the rest is graded and the count reported. That makes the
// ORDER load-bearing — `faults > 0` is checked BEFORE the survivor decision, so a run holding
// one of each is 2, never 1. Inverting those two lines is the way this distinction dies quietly.
//
// Bounds, stated because understating them would be this tool's own defect:
//   - it grades only what is ENCODED. A `MUTATION:` comment nobody translated into a data entry
//     is invisible to the run and visible only under `--coverage`, which is why that mode exists;
//   - `expectRed` is compared as an EXACT SET. A mutation that reddens a superset of the named
//     tests is reported MISMATCH, not CAUGHT — §7 calls a comment naming fewer tests than it
//     actually breaks "under-specific", and silently passing it would launder that defect;
//   - the worktree is built from HEAD by default, so an UNCOMMITTED edit to a target or a suite is
//     not what gets graded. The run measures the committed tree; that is what a commit message
//     claims about. `--staged` is the stated exception: it builds the worktree from a commit made
//     of the INDEX, so there the staged edit IS what gets graded and an unstaged one still is not.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MAX_BUFFER = 64 * 1024 * 1024

/** Per-mutation suite budget. A hanging break must fail the harness, never stall it. */
const SUITE_TIMEOUT_MS = 120_000

/** Mode flags. Options (`--guard`, `--scratch`) take a value and are NOT modes. */
const MODE_FLAGS = new Set(['--list', '--coverage', '--update-expected'])
const OPTION_FLAGS = new Set(['--guard', '--scratch', '--jobs'])
/** Boolean flags: present or absent, never take a value. */
const BOOLEAN_FLAGS = new Set(['--staged'])

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

/** A test point opens on a line beginning `test(` or `it(`. */
const TEST_LINE_RE = /^\s*(?:test|it)(?:\.\w+)?\s*\(/
/** `// GROUP: <id>, <id>` — the marker linking a claim site to the mutations that encode it. */
const GROUP_MARKER_RE = /^\s*\/\/ GROUP: (.*)$/
/** Any comment line. A marker's id list continues onto one of these while it ends with a comma. */
const COMMENT_LINE_RE = /^\s*\/\/ ?(.*)$/
/** A marker continues onto a comment line only while that line is itself an id list. */
const ID_LIST_RE = /^[\w-]+(?:\s*,\s*[\w-]+)*,?$/

/** Index into `testLines` of the nearest test line strictly above `i`, or -1 for none. */
function ownerAbove(testLines, i) {
  let k = -1
  for (let t = 0; t < testLines.length; t++) {
    if (testLines[t] < i) k = t
    else break
  }
  return k
}

/** Leading-whitespace width. A body line is indented past the `test(` line that opened it. */
const indentOf = (l) => l.length - l.trimStart().length

/** One marker plus the continuation lines it owns: `{ ids, last }`, `last` its final line. */
function readMarker(lines, i, m) {
  let raw = m[1].trim()
  let last = i
  while (raw.endsWith(',') && last + 1 < lines.length) {
    const cont = COMMENT_LINE_RE.exec(lines[last + 1])
    if (!cont || !ID_LIST_RE.test(cont[1].trim())) break
    last++
    raw = `${raw} ${cont[1].trim()}`.trim()
  }
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return { ids, last }
}

/**
 * Read one suite's claim sites and `GROUP:` markers.
 *
 * Returns `{ header: { claims, groups }, tests: [{ line, groups, claims }] }`, `line` 1-based.
 *
 * ATTACHMENT. A marker sitting directly above a `test(` names that test; a marker inside a body
 * names the test it is written in, not the next one. So the lookahead skips blanks and comments
 * and asks what the marker actually precedes — an assertion means the enclosing test.
 *
 * CLAIMS. Only `MUTATION:` on a COMMENT line is a claim. The token also appears in test titles and
 * in string fixtures, where it is the harness's own subject matter rather than an assertion about
 * a break, and counting those would inflate the very number this measures.
 */
export function parseSuite(text) {
  // A CRLF `\r` survives the split and no `$`-anchored pattern here can match past it, so a
  // Windows-ending suite would parse as having no markers at all — silently, and fail-open.
  const lines = String(text)
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
  const testLines = []
  lines.forEach((l, i) => {
    if (TEST_LINE_RE.test(l)) testLines.push(i)
  })
  const tests = testLines.map((i) => ({ line: i + 1, groups: [], claims: 0 }))
  const header = { claims: 0, groups: [] }

  /**
   * The test a comment belongs to. `from` is its last line, `anchor` its first.
   * Scanning down past blanks and comments: a test line there OWNS the comment. Otherwise the
   * test above owns it only while the comment is still INSIDE that body — indented past the
   * `test(` line. A comment back at that indent has left the body and belongs to the file.
   */
  const ownerFor = (from, anchor) => {
    let j = from + 1
    while (j < lines.length && (lines[j].trim() === '' || COMMENT_LINE_RE.test(lines[j]))) j++
    if (j < lines.length && TEST_LINE_RE.test(lines[j])) return tests[testLines.indexOf(j)]
    const k = ownerAbove(testLines, anchor)
    if (k === -1 || indentOf(lines[anchor]) <= indentOf(lines[testLines[k]])) return header
    return tests[k]
  }

  const markerLines = scanMarkers(lines, ownerFor)
  scanClaims(lines, markerLines, ownerFor)
  return { header, tests }
}

/** Attach every `GROUP:` marker to its owner. Returns the line numbers the markers occupy. */
function scanMarkers(lines, ownerFor) {
  const markerLines = new Set()
  for (let i = 0; i < lines.length; i++) {
    const m = GROUP_MARKER_RE.exec(lines[i])
    if (!m) continue
    const { ids, last } = readMarker(lines, i, m)
    for (let k = i; k <= last; k++) markerLines.add(k)
    ownerFor(last, i).groups.push(...ids)
  }
  return markerLines
}

/** Count every `MUTATION:` claim onto its owner. A marker line is never also a claim line. */
function scanClaims(lines, markerLines, ownerFor) {
  for (let i = 0; i < lines.length; i++) {
    if (markerLines.has(i)) continue
    if (!/^\s*\/\//.test(lines[i])) continue
    const n = (lines[i].match(/MUTATION:/g) ?? []).length
    if (n === 0) continue
    ownerFor(i, i).claims += n
  }
}

/**
 * Which `GROUP:` ids name no mutation in the data file? Returns one problem string per dangling
 * id; empty means every marker resolves.
 *
 * A marker is a REFERENCE. An id that resolves to nothing reads as coverage and is not — the same
 * defect an unencoded `MUTATION:` comment carries, one indirection further out.
 */
export function groupProblems(parsed, ids, label) {
  const problems = []
  const check = (groups, where) => {
    for (const id of groups) {
      if (!ids.has(id)) problems.push(`${label}${where}: GROUP id "${id}" names no mutation`)
    }
  }
  check(parsed.header.groups, ' (before the first test)')
  for (const t of parsed.tests) check(t.groups, `:${t.line}`)
  return problems
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

/** The three ways a flag set names more than one run: two modes, `--staged` or `--jobs` on a
 * non-run mode. */
function modeConflict(modes, opts) {
  // Two modes both pass the unknown-flag gate, then whichever branch is tested first wins and
  // the other request is dropped with no diagnostic at exit 0 — the collision
  // `check-file-size-guard.mjs` documents at its own arg parser. Precedence between modes is
  // not a thing to guess at.
  if (new Set(modes).size > 1) {
    return { error: `${[...new Set(modes)].join(' and ')} are separate modes — run one` }
  }
  // `--staged` picks the ref the plain run grades against; the other modes (`--list`, `--coverage`,
  // `--update-expected`) have no ref-dependent behavior to redirect, so combining it with one is a
  // request that names a mechanism the mode never consults — refuse rather than silently ignore it.
  if (opts.staged && modes.length > 0) {
    return {
      error: '--staged only applies to a plain run (no --list, --coverage or --update-expected)',
    }
  }
  // `--jobs` parallelises a GRADING run. `--list` and `--coverage` grade nothing, so the flag
  // would name a mechanism neither mode consults.
  if (opts.jobs !== null && (modes.includes('--list') || modes.includes('--coverage'))) {
    return { error: '--jobs only applies to a grading run (no --list or --coverage)' }
  }
  return null
}

/** Parse `--jobs`'s value: a positive integer, or an arg error. */
export function parseJobs(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) {
    return { error: `--jobs must be a positive integer (got ${JSON.stringify(value)})` }
  }
  return { jobs: n }
}

/**
 * Consume one flag at `args[i]`, recording it in `modes`/`opts`.
 * Returns `{ error }`, or `{ i }` — the index of the last argument consumed.
 */
function readFlag(args, i, modes, opts) {
  const a = args[i]
  if (!a.startsWith('--')) {
    // A bare positional is never meaningful here, and accepting one is how a flag typo
    // (`-list`) becomes a silently ignored argument on a run that then reports green.
    return { error: `unexpected argument ${JSON.stringify(a)} — this tool takes flags only` }
  }
  if (MODE_FLAGS.has(a)) {
    modes.push(a)
    return { i }
  }
  if (BOOLEAN_FLAGS.has(a)) {
    opts[a.slice(2)] = true
    return { i }
  }
  if (!OPTION_FLAGS.has(a)) return { error: `unknown flag ${a}` }
  const value = args[i + 1]
  if (value === undefined || value.startsWith('--')) return { error: `${a} requires a value` }
  opts[a.slice(2)] = value
  return { i: i + 1 }
}

/** Parse argv. Returns `{ error }` or `{ mode, guard, scratch, staged, jobs }`. */
export function parseArgs(args) {
  const modes = []
  const opts = { guard: null, scratch: null, staged: false, jobs: null }
  for (let i = 0; i < args.length; i++) {
    const read = readFlag(args, i, modes, opts)
    if (read.error) return { error: read.error }
    i = read.i
  }
  const jobsResult = parseJobs(opts.jobs ?? '1')
  if (jobsResult.error) return { error: jobsResult.error }
  const clash = modeConflict(modes, opts)
  if (clash) return clash
  return {
    mode: modes.length === 0 ? 'run' : modes[0].slice(2),
    guard: opts.guard,
    scratch: opts.scratch,
    staged: opts.staged,
    jobs: jobsResult.jobs,
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

/**
 * Data files present in `.claude/hooks` AT `ref` — the committed/indexed tree, never the working
 * directory — so a `--staged` run's CANDIDATE set matches what the commit actually carries. A
 * file only `git rm --cached`-ed but still on disk must drop out; a brand-new untracked data file
 * must not silently enter. `git ls-tree --name-only <ref> -- .claude/hooks/` returns full
 * repo-relative paths (`.claude/hooks/<name>.mutations.json`), so `basename` is taken from the last
 * path segment, not the whole entry.
 */
function dataFilesAt(root, ref) {
  const out = git(['ls-tree', '--name-only', ref, '--', '.claude/hooks/'], root)
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith(DATA_SUFFIX))
    .sort()
    .map((f) => ({
      basename: f.slice(f.lastIndexOf('/') + 1, -DATA_SUFFIX.length),
      path: join(root, f),
    }))
}

/** Parse and validate one data file's already-read text, errors tagged with `file.path`. */
function parseDataFile(text, file) {
  let obj
  try {
    obj = JSON.parse(text)
  } catch (err) {
    throw new Error(`${file.path}: unreadable or malformed JSON — ${err.message}`)
  }
  const problems = validateDataFile(obj, file.path)
  if (problems.length > 0) throw new Error(problems.join('\n  '))
  return obj
}

function loadDataFile(file) {
  return parseDataFile(readFileSync(file.path, 'utf8'), file)
}

/**
 * `file`'s content AT `ref`'s tree — never the working tree — so a `--staged` run grades the
 * INDEXED `find`/`replace`/`expectRed`, not an unstaged-only edit sitting on top of it. Returns
 * null ONLY when `file` has no entry in that tree at all — untracked, or `git rm --cached`-ed.
 * A committed file the commit leaves alone still has an entry, so it still loads; whether it is
 * GRADED is `filterByStagedScope`'s question, not this one.
 */
function loadDataFileAt(root, file, ref) {
  const text = blobAt(root, ref, file.path)
  if (text === null) return null
  return parseDataFile(text, file)
}

/**
 * `path`'s content at `ref`, or null when that path is simply not in that tree.
 *
 * Existence is its own question, asked with its own command: a catch around `git show` would read
 * EVERY failure — an index lock, a corrupt object, git off PATH — as "not staged", silently drop
 * that guard from the run, and still exit 0. `git cat-file -e <ref>:<path>` cannot carry the
 * distinction either — it exits 128 BOTH for a path absent from a valid tree and for a ref that
 * does not resolve, so one unresolvable ref would empty the scope and report nothing to grade.
 * `ls-tree` separates them: exit 0 with empty output is absence, a non-zero exit is a fault.
 */
export function blobAt(root, ref, path) {
  const rel = relPath(root, path)
  const probe = spawnSync('git', ['ls-tree', ref, '--', rel], { cwd: root, encoding: 'utf8' })
  // Same disposition as `git()` above: a spawn that never ran leaves `status` null, and
  // interpolating that yields "exited null" while discarding the only diagnostic there is.
  if (probe.error) throw probe.error
  if (probe.status !== 0) {
    const why = (probe.stderr || '').trim() || `git ls-tree exited ${probe.status}`
    throw new Error(`cannot read ${rel} at ${ref}: ${why}`)
  }
  if (probe.stdout.trim() === '') return null
  return git(['show', `${ref}:${rel}`], root)
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

// ---------------------------------------------------------------- --staged: ref and scope

/** A commit of the INDEX tree, without moving HEAD or touching the worktree. */
function indexCommit(root) {
  // `write-tree` refuses an index holding unmerged entries, and `commit-tree -p HEAD` fails on an
  // unborn HEAD. Both reach the caller as a generic fault, so name them here instead.
  let tree
  try {
    tree = git(['write-tree'], root).trim()
  } catch (e) {
    throw new Error(`--staged cannot grade this index (unresolved merge conflicts?): ${e.message}`)
  }
  try {
    // Explicit identity, not inherited config: a CI runner or a fresh clone may carry no
    // `user.name`/`user.email` at all, and `commit-tree` refuses to make a commit without one.
    return git(
      [
        '-c',
        'user.name=mutation-harness',
        '-c',
        'user.email=mutation-harness@localhost',
        'commit-tree',
        tree,
        '-p',
        'HEAD',
        '-m',
        'index',
      ],
      root,
    ).trim()
  } catch (e) {
    throw new Error(`--staged needs a commit to parent from (unborn HEAD?): ${e.message}`)
  }
}

/** Root-relative POSIX paths currently staged. */
function stagedPaths(root) {
  // --no-renames: a staged rename otherwise lists only the NEW path, scoping out the guard whose
  // target moved away.
  const out = git(['diff', '--cached', '--name-only', '--no-renames', '-z'], root)
  return new Set(out.split('\u0000').filter(Boolean))
}

/** `p` (absolute or root-relative) as a root-relative POSIX path. */
export function relPath(root, p) {
  const abs = isAbsolute(p) ? p : join(root, p)
  // A path outside `root` would `.slice()` into a silently wrong string — and every caller feeds
  // the result to `staged.has(...)`, where a wrong string is indistinguishable from "not staged".
  // Scope would narrow with no diagnostic, so this faults instead.
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path escapes the repo root: ${p} (root ${root})`)
  }
  return abs
    .slice(root.length + 1)
    .split(sep)
    .join('/')
}

/**
 * Relative-specifier imports of `text`, resolved against the directory of `from`.
 *
 * A specifier resolving OUTSIDE `root` is SKIPPED, not thrown — the scope walk (`reachable`)
 * follows import chains across the whole repo, and a file importing something outside it (a
 * node_modules shim reached via a relative path, a symlink target) is not a defect in the walk;
 * refusing there would fault a `--staged` run over a file it was never asked to grade.
 */
export function localImports(root, from, text) {
  const out = []
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    const abs = resolve(dirname(isAbsolute(from) ? from : join(root, from)), m[1])
    if (abs !== root && !abs.startsWith(root + sep)) continue
    out.push(relPath(root, abs))
  }
  return out
}

/**
 * Repo-relative paths a suite NAMES as a string literal. A file a suite reads directly —
 * `readFileSync('.claude/limits.json')` — is a graded input that no import hop can see, so
 * without this a commit staging only that file grades nothing and exits 0. Over-inclusion is
 * harmless: a literal naming nothing simply matches nothing staged.
 *
 * Bounded to LITERALS. A computed path (a template with a substitution, a joined variable) names
 * nothing this can read, exactly as `localImports` cannot follow a computed specifier.
 *
 * A leading `./` (one or more) is stripped so `'./kit.mjs'` and `'kit.mjs'` compare equal to the
 * root-relative form every caller stages against — `staged.has(...)` otherwise never matches a
 * literal spelled with the relative prefix.
 */
export function namedPaths(text) {
  const re = /['"`]([A-Za-z0-9._][\w.-]*(?:\/[\w.-]+)+)['"`]/g
  return [...text.matchAll(re)].map((m) => m[1].replace(/^(?:\.\/)+/, ''))
}

/**
 * Every path TRANSITIVELY reachable from `seeds` by following `localImports`, cycle-guarded by a
 * visited set keyed on the root-relative path — an import cycle terminates instead of looping.
 *
 * `includeNamed`: also collect every `namedPaths` literal in each file reached, not only the
 * seeds themselves — a suite that imports a helper which in turn `readFileSync`s a fixture by
 * literal path declares that dependency nowhere an import-only walk can see. Set for a SUITE
 * walk (#1329: "every file reached from a suite"), unset for a TARGET walk — the target's own
 * `namedPaths` are not part of what makes it gradeable.
 */
function reachable(root, seeds, readAt, includeNamed) {
  const visited = new Set()
  const found = new Set()
  const queue = [...seeds]
  while (queue.length > 0) {
    const cur = queue.shift()
    const rel = relPath(root, cur)
    if (visited.has(rel)) continue
    visited.add(rel)
    const text = readAt(cur)
    if (text === null) continue
    for (const imp of localImports(root, cur, text)) {
      found.add(imp)
      queue.push(imp)
    }
    if (includeNamed) for (const named of namedPaths(text)) found.add(named)
  }
  return found
}

/**
 * Whether `staged` holds any of: `file`'s own path, `data.target`, a `data.suites` entry, or a
 * path TRANSITIVELY reachable from `data.target` or `data.suites` by import (plus every
 * `namedPaths` literal reached from a suite) — #1329.
 *
 * The reachable set is load-bearing because no data file names it. A shared testkit reaches the
 * run only through an import chain, and a fixture path only through a literal, so without this
 * walk a commit staging ONLY that file grades nothing and exits 0 — while the edit can redden
 * every suite (or the target itself) that depends on it.
 */
export function touchesStaged(root, file, data, staged, readAt = null) {
  const paths = [file.path, data.target, ...data.suites]
  if (paths.some((p) => staged.has(relPath(root, p)))) return true
  if (!readAt) return false
  const fromTarget = reachable(root, [data.target], readAt, false)
  if ([...fromTarget].some((p) => staged.has(p))) return true
  const fromSuites = reachable(root, data.suites, readAt, true)
  return [...fromSuites].some((p) => staged.has(p))
}

/** Data files `touchesStaged` keeps — everything else is a no-op. */
function filterByStagedScope(root, loaded, ref) {
  const staged = stagedPaths(root)
  const readAt = (suite) => blobAt(root, ref, suite)
  return loaded.filter(({ file, data }) => touchesStaged(root, file, data, staged, readAt))
}

/**
 * Decide what a finished `spawnSync` result MEANS, before any of it is graded.
 *
 * Returns for a run whose output can be graded; throws for every shape that yields NO VERDICT.
 *
 * Pure, and extracted deliberately. `runMutation` is side effects end to end and the unit suite
 * excludes it by design, so this — the only real DECISION in it — was reachable by no test at all.
 * Out here it is both pinnable and readable; the caller keeps the side effects.
 */
export function assertSpawnUsable(mutId, r, timeoutMs) {
  // `spawnSync` always returns an object, so this is unreachable from the one production caller.
  // It is here because the function is EXPORTED: the three throws below all name the mutation, and
  // a bare TypeError would be the only way out of this function that does not.
  if (r == null) throw new Error(`mutation ${mutId}: no spawn result to read — NO VERDICT`)
  if (r.error) {
    // ETIMEDOUT FIRST. `spawnSync` sets BOTH `error` and `signal` on a timeout, so a generic
    // `error` branch reports "could not spawn node" for a suite that spawned perfectly well and
    // then ran long — and the timeout message below, written for exactly this case, is never
    // reached. Naming the wrong cause in a harness whose job is grading claims is the defect this
    // harness exists to catch.
    if (r.error.code === 'ETIMEDOUT') {
      throw new Error(
        `mutation ${mutId}: suite run exceeded ${timeoutMs}ms and was killed — NO VERDICT`,
      )
    }
    throw new Error(`mutation ${mutId}: could not spawn node — ${r.error.message}`)
  }
  // Reached only for a kill this harness did NOT ask for — an OOM killer, an operator, a parent
  // process group teardown. The timeout path throws above, so a signal arriving here had none.
  if (r.signal) {
    throw new Error(
      `mutation ${mutId}: suite run killed by ${r.signal} (no timeout reported) — NO VERDICT`,
    )
  }
}

/**
 * Run `node <args>` and resolve to the SAME shape `spawnSync` returns — `{ status, signal,
 * stdout, stderr, error }` — so `assertSpawnUsable` needs no change. Timeout → SIGKILL +
 * `error.code = 'ETIMEDOUT'` (matching `spawnSync`'s own timeout shape); combined stdout+stderr
 * over `maxBuffer` → SIGKILL + `error.code = 'ENOBUFS'` (matching `spawnSync`'s own overflow
 * shape). Concurrency is the whole reason this exists: `spawnSync` blocks the event loop, so N
 * mutations could never run in parallel through it.
 */
export function spawnSuite(args, opts) {
  return new Promise((settle) => runSpawnSuiteProcess(args, opts, settle))
}

/** Build the ENOBUFS result `spawnSuite`'s `checkBuffer` finishes with on overflow. */
function spawnSuiteOverflowResult(stdout, stderr) {
  return {
    status: null,
    signal: null,
    stdout,
    stderr,
    error: Object.assign(new Error('spawnSuite output exceeded maxBuffer'), {
      code: 'ENOBUFS',
    }),
  }
}

/** Wire the child's `error`/`close` events to `finish`, distinguishing a timeout close. */
function wireSpawnSuiteExit(child, finish, getState) {
  child.on('error', (error) => {
    const { stdout, stderr } = getState()
    finish({ status: null, signal: null, stdout, stderr, error })
  })
  child.on('close', (status, signal) => {
    const { stdout, stderr, timedOut } = getState()
    if (timedOut) {
      finish({
        status,
        signal,
        stdout,
        stderr,
        error: Object.assign(new Error('spawnSuite timed out'), { code: 'ETIMEDOUT' }),
      })
      return
    }
    finish({ status, signal, stdout, stderr, error: null })
  })
}

/** Create the child, wire its output/exit handlers, and settle `spawnSuite`'s promise. */
function runSpawnSuiteProcess(args, { cwd, timeout, maxBuffer, killSignal = 'SIGKILL' }, settle) {
  const child = spawn('node', args, { cwd })
  let stdout = ''
  let stderr = ''
  let done = false,
    timedOut = false
  const finish = (result) => {
    if (done) return
    done = true
    clearTimeout(timer)
    settle(result)
  }
  const timer = setTimeout(() => {
    timedOut = true
    child.kill(killSignal)
  }, timeout)
  const checkBuffer = () => {
    if (stdout.length + stderr.length <= maxBuffer) return
    child.kill(killSignal)
    finish(spawnSuiteOverflowResult(stdout, stderr))
  }
  child.stdout.on('data', (d) => {
    stdout += d
    checkBuffer()
  })
  child.stderr.on('data', (d) => {
    stderr += d
    checkBuffer()
  })
  wireSpawnSuiteExit(child, finish, () => ({ stdout, stderr, timedOut }))
}

/**
 * SYNC half of one mutation: make the worktree, assert the anchor is unique, write the mutated
 * target. Runs on the main thread like every git call — worktrees never race each other even
 * under `--jobs N`, because the event loop serialises them.
 */
function prepareMutation({ root, wt, data, mut, ref }) {
  git(['worktree', 'add', '--detach', wt, ref], root)
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
}

/** SYNC half: turn a finished `spawnSuite` result into a verdict. Throws for NO VERDICT. */
function finishMutation(mut, r) {
  assertSpawnUsable(mut.id, r, SUITE_TIMEOUT_MS)
  let tap
  try {
    tap = parseTap(r.stdout ?? '')
  } catch (err) {
    throw new Error(`mutation ${mut.id}: ${err.message}\n${(r.stderr || '').trim()}`)
  }
  return { id: mut.id, ...compareResult(mut.expectRed, tap.failed), failed: tap.failed }
}

/**
 * Remove a mutation's worktree, best-effort. `--force` because the tree is dirty by
 * construction: we just mutated a tracked file in it.
 */
function cleanupWorktree(root, wt) {
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
    // The directory is made by `mkdtempSync` BEFORE prepareMutation runs, so a failed
    // `worktree add` leaves a path git never registered: `worktree remove` refuses it and
    // `prune` only tidies git's own admin entries. Neither deletes it. Harmless once; per-mutation
    // fault isolation makes it once PER MUTATION, so remove the directory directly. A no-op when
    // git already did.
    try {
      rmSync(wt, { recursive: true, force: true })
    } catch {
      /* the temp dir outlives this run; tmpdir() is reclaimed by the OS */
    }
  }
}

/**
 * Apply ONE mutation in a throwaway worktree and report the verdict.
 *
 * The ordering is the point: create the worktree, assert the anchor is unique, write, run,
 * compare, and remove the worktree in `finally` so cleanup survives a throw. A leaked worktree
 * is a documented bypass class in `.claude/agents/test-writer.md` — it keeps the mutated code
 * on disk while the primary repo's status, HEAD and stash list are all blind to it. Only the
 * suite run (`spawnSuite`) is concurrent; `mkdtempSync` and every git call are synchronous on the
 * main thread, so they never overlap across mutations even under `--jobs N`.
 */
async function runMutation({ root, data, mut, base, ref }) {
  const wt = mkdtempSync(join(base, 'run-mutations-'))
  try {
    prepareMutation({ root, wt, data, mut, ref })
    // cwd is the WORKTREE ROOT, not the suite's directory: the suites resolve
    // `.claude/limits.json` by a CWD-relative path and fail with ENOENT from anywhere else.
    const r = await spawnSuite(['--test', '--test-reporter=tap', ...data.suites], {
      cwd: wt,
      maxBuffer: MAX_BUFFER,
      // `node --test` applies no default per-test timeout, so a mutation that produces an
      // unbounded loop would block until CI killed the job — no verdict, no partial report.
      // Not hypothetical: `check-file-size-guard.mutations.json` records a break that HANGS,
      // which is why that entry encodes a return flip instead. A timeout sets `error` (ETIMEDOUT)
      // AND `signal` — measured, not assumed — so `assertSpawnUsable` reads `error` first and must
      // name the timeout there. Every route THROUGH THAT HELPER leads to exit 2: a harness failure,
      // never a verdict. `runMutation`'s normal return is a separate path and yields 0 or 1.
      timeout: SUITE_TIMEOUT_MS,
      // SIGKILL, not the SIGTERM default: an interceptable kill turns the bound above into a
      // suggestion. Today's suites are bare `node --test` and trap nothing — the point is that
      // the budget must hold for a suite that DOES, since a stall reports no verdict at all.
      killSignal: 'SIGKILL',
    })
    return finishMutation(mut, r)
  } finally {
    cleanupWorktree(root, wt)
  }
}

/** `all`, narrowed to `guard`'s basename, or `all` unchanged when `guard` is falsy. */
function selectFiles(all, guard) {
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
  const files = selectFiles(dataFiles(root), guard)
  if (files.length === 0) console.log('no *.mutations.json data files found')
  for (const file of files) {
    const data = loadDataFile(file)
    console.log(`${file.basename}${DATA_SUFFIX}  → ${data.target}`)
    for (const mut of data.mutations) console.log(`  ${mut.id}`)
    for (const n of data.notEncoded ?? []) console.log(`  (not encoded) ${n.claim}`)
  }
  return 0
}

/**
 * Read every declared suite of one data file and total its claim sites, its linked claim sites,
 * and the ids its markers name. `problems` carries every dangling marker id.
 */
/** Suite text as it sits on disk — the tree `--coverage` reports on. */
function workingTreeSuite(root, suite) {
  return readFileSync(isAbsolute(suite) ? suite : join(root, suite), 'utf8')
}

/**
 * Suite text at `ref` — HEAD normally, or the synthetic index commit under `--staged` — the tree
 * the grading run executes. Validating the working tree instead would split the two halves of one
 * gate: an unstaged marker fix would hide a dangling id in the committed suite, and an unstaged
 * dangling one would block a run that is valid as committed.
 */
function committedSuiteAt(ref) {
  return (root, suite) =>
    isAbsolute(suite) ? readFileSync(suite, 'utf8') : git(['show', `${ref}:${suite}`], root)
}

/** 4 params: the reader is the tree being surveyed, not data — `--coverage` and `--run` differ. */
function surveySuites(root, data, ids, readSuite = workingTreeSuite) {
  const survey = { sites: 0, linked: 0, fileLevel: 0, named: new Set(), problems: [] }
  for (const suite of data.suites) {
    const parsed = parseSuite(readSuite(root, suite))
    // A claim site is a claim attached to a TEST. A claim reaching no test is reported on its own
    // line rather than dropped: it may be convention prose, or a real claim separated from its
    // test by code, and discarding it would hide the second case inside the first.
    survey.fileLevel += parsed.header.claims
    for (const owner of parsed.tests) {
      survey.sites += owner.claims
      if (owner.groups.length > 0) survey.linked += owner.claims
    }
    for (const owner of [parsed.header, ...parsed.tests]) {
      for (const id of owner.groups) survey.named.add(id)
    }
    survey.problems.push(...groupProblems(parsed, ids, suite))
  }
  return survey
}

function modeCoverage(root, guard) {
  const files = selectFiles(dataFiles(root), guard)
  if (files.length === 0) console.log('no *.mutations.json data files found')
  let dangling = 0
  for (const file of files) {
    const data = loadDataFile(file)
    const ids = new Set(data.mutations.map((m) => m.id))
    const survey = surveySuites(root, data, ids)
    const named = [...survey.named].filter((id) => ids.has(id)).length
    console.log(`${file.basename}${DATA_SUFFIX}`)
    console.log(`  claim sites (comment claims) : ${survey.sites}`)
    console.log(`  ...linked by a GROUP marker  : ${survey.linked}`)
    console.log(`  ...not linked                : ${survey.sites - survey.linked}`)
    console.log(`  claims reaching no test      : ${survey.fileLevel}`)
    console.log(`  encoded mutations            : ${data.mutations.length}`)
    console.log(`  ...named by a marker         : ${named}`)
    console.log(`  declared not-encodable       : ${(data.notEncoded ?? []).length}`)
    for (const p of survey.problems) {
      console.log(`  DANGLING ${p}`)
      dangling++
    }
  }
  return dangling === 0 ? 0 : 1
}

/**
 * Run ONE mutation. Returns `{ outcome, lines, result }` — never throws, never prints.
 *
 * `outcome` is 'caught' | 'bad' | 'fault'. `lines` is the report `gradeScoped` prints, in order,
 * once every mutation in the batch has a verdict — printing here would interleave across
 * concurrent mutations under `--jobs N` and make the report order depend on completion order
 * instead of the data-file/mutation order R2 requires. `result` is `{ id, status, observed }`
 * for `onResult`, or null for a fault (a fault has no observed set).
 *
 * ISOLATE the fault, do NOT swallow it. Every OTHER mutation is independent of this one, so
 * aborting the batch throws away every verdict it could still have earned — both stale anchors on
 * this branch cost a full re-run for exactly that reason. The caller turns any 'fault' into exit
 * 2: a run carrying one has NOT established that the encoded claims hold.
 *
 * 'fault' is EVERY throw from `runMutation`, not only a bad recipe. A stale anchor, an unreadable
 * target and unparseable TAP are recipe faults you fix in the data file; a failed worktree, a
 * spawn error and a suite timeout are ENVIRONMENTAL and the data file is innocent. Both land here
 * and both mean the same thing about the RUN, which is why they share a verdict — but a reader
 * told only about recipes will go audit a data file that is fine.
 */
async function gradeOne({ root, data, mut, base, ref }) {
  let res
  try {
    res = await runMutation({ root, data, mut, base, ref })
  } catch (err) {
    return {
      outcome: 'fault',
      lines: [`  FAULT     ${mut.id}`, `    ${err.message}`],
      result: null,
    }
  }
  // `res.failed` is the raw TAP list, so it can repeat a name; the SET is what an `expectRed`
  // means, and is what `--update-expected` would write.
  const result = { id: mut.id, status: res.status, observed: [...new Set(res.failed)] }
  if (res.status === 'CAUGHT') {
    return { outcome: 'caught', lines: [`  CAUGHT    ${mut.id}`], result }
  }
  const lines = [`  ${res.status.padEnd(9)} ${mut.id}`]
  lines.push(`    expected red : ${mut.expectRed.join(' | ') || '(none)'}`)
  lines.push(`    actually red : ${res.failed.join(' | ') || '(none — the suites were green)'}`)
  if (res.missing.length > 0) lines.push(`    never went red: ${res.missing.join(' | ')}`)
  if (res.unexpected.length > 0) {
    lines.push(`    also went red: ${res.unexpected.join(' | ')} — the claim is under-specific`)
  }
  return { outcome: 'bad', lines, result }
}

/**
 * biome's `formatter.lineWidth` (biome.json). `lefthook.yml` runs `biome check --write` on staged
 * JSON, so a width this writer guesses wrong is silently corrected AT COMMIT — after the human
 * reviewed a diff that is not what lands. Matching it is not cosmetic.
 */
const JSON_LINE_WIDTH = 100
const EXPECT_KEY = '"expectRed": '

/**
 * One `expectRed` array as biome would format it, starting at `indent`.
 *
 * `hasComma` only feeds the width sum — the comma itself sits outside the replaced span.
 */
export function renderExpectRed(indent, names, hasComma) {
  // ONE call site for the escaping on purpose. Written twice, an anchor on either copy is
  // ambiguous and a mutation can only ever pin half of it.
  const q = (n) => JSON.stringify(n)
  const oneLine = `[${names.map(q).join(', ')}]`
  if (indent.length + EXPECT_KEY.length + oneLine.length + (hasComma ? 1 : 0) <= JSON_LINE_WIDTH) {
    return indent + EXPECT_KEY + oneLine
  }
  const inner = `${indent}  `
  return `${indent}${EXPECT_KEY}[\n${names.map((n) => inner + q(n)).join(',\n')}\n${indent}]`
}

/**
 * Index of the `]` closing a FLAT array of JSON strings opening at `open`.
 *
 * Throws on anything else — a nested array, an object, a number, an unterminated array. The
 * writer refuses rather than splicing blind: a bad splice corrupts the encoded corpus itself.
 */
function scanStringArrayEnd(text, open, id) {
  let i = open + 1
  let inString = false
  while (i < text.length) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i += 2
      else if (c === '"') {
        inString = false
        i++
      } else i++
      continue
    }
    if (c === '"') {
      inString = true
      i++
      continue
    }
    if (c === ']') return i
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ',') {
      i++
      continue
    }
    throw new Error(
      `\`expectRed\` for ${id} is not a flat array of JSON strings (found ${JSON.stringify(c)}) — refusing to edit it`,
    )
  }
  throw new Error(`\`expectRed\` for ${id} is never closed — refusing to edit it`)
}

/**
 * Replace ONE entry's `expectRed` array in the raw JSON TEXT.
 *
 * Never `JSON.parse`s to WRITE. Re-serialising a tracked data file reformats every line and buries
 * the two the author meant to change; `check-file-size-guard.mjs --update-baseline` does exactly
 * that and the rules name it as the part not to copy.
 *
 * `assertSingleOccurrence` is deliberately NOT reused: its hints describe the mutation TARGET
 * ("the data file is stale against HEAD", "extend the anchor until it is unique"), which here
 * would name the wrong file and the wrong remedy.
 */
/** Where entry `id` starts, and the text belonging to it alone. Throws unless it occurs once. */
function entryBounds(text, id) {
  const idAnchor = `"id": ${JSON.stringify(id)}`
  const count = text.split(idAnchor).length - 1
  if (count === 0) {
    throw new Error(`no entry ${id} in the data file text — nothing written`)
  }
  if (count > 1) {
    throw new Error(
      `${id} occurs ${count} times in the data file text — refusing to edit an ambiguous entry; nothing written`,
    )
  }
  const entryStart = text.indexOf(idAnchor)
  const nextId = text.indexOf('"id": ', entryStart + idAnchor.length)
  return { entryStart, slice: text.slice(entryStart, nextId === -1 ? text.length : nextId) }
}

export function replaceExpectRed(text, id, names) {
  const { entryStart, slice } = entryBounds(text, id)
  const hits = [...slice.matchAll(/^([ \t]*)"expectRed": /gm)]
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one \`expectRed\` in entry ${id}, found ${hits.length} — nothing written`,
    )
  }
  const [hit] = hits
  const indent = hit[1]
  const open = entryStart + hit.index + hit[0].length
  if (text[open] !== '[') {
    throw new Error(`\`expectRed\` for ${id} does not open with \`[\` — refusing to edit it`)
  }
  const close = scanStringArrayEnd(text, open, id)
  const hasComma = text[close + 1] === ','
  return (
    text.slice(0, entryStart + hit.index) +
    renderExpectRed(indent, names, hasComma) +
    text.slice(close + 1)
  )
}

/**
 * Declared inputs that differ from HEAD.
 *
 * The grading run reads HEAD — `committedSuite` and `git worktree add --detach HEAD`. The case
 * this mode exists for is "I just added a test", and uncommitted that test is invisible to the
 * grader: the run would grade the OLD tree and write the OLD observed set, reporting success.
 * Writing a stale expectation while looking like it worked is worse than doing nothing.
 *
 * Scoped to `target` + `suites` and never the data file, which is dirty by construction here.
 */
function uncommittedInputs(root, data) {
  // `--untracked-files=all` is load-bearing, not decoration: `--porcelain` honours
  // `status.showUntrackedFiles`, so under `no` a NEWLY ADDED suite reports nothing and this
  // gate passes on exactly the case it exists to refuse — a test that is not in HEAD.
  const out = git(
    ['status', '--porcelain', '--untracked-files=all', '--', data.target, ...data.suites],
    root,
  )
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => l.slice(3))
}

/**
 * Grade, then rewrite the `expectRed` of every MISMATCHing entry from the set actually observed.
 *
 * Human-invoked only: this is the sole route to the only write that targets a tracked data file.
 * A check laborious to keep current gets disabled, which is why this exists — but a harness that
 * refreshed its own expectations unattended would launder them, so the flag is opt-in, prints
 * every change, and writes nothing else.
 */
/** The refusing file, or null when every declared input matches HEAD. */
function firstDirtyFile(root, files) {
  for (const file of files) {
    const dirty = uncommittedInputs(root, loadDataFile(file))
    if (dirty.length > 0) {
      console.error(`✖ ${file.basename}${DATA_SUFFIX}: uncommitted input(s) — NOTHING WRITTEN`)
      for (const p of dirty) console.error(`    ${p}`)
      console.error(
        '  The grading run reads HEAD, so the set written would be the OLD one. Commit, then re-run.',
      )
      return file
    }
  }
  return null
}

/**
 * Splice one file's MISMATCHed entries, then read the result back before it reaches disk.
 *
 * A parse to VERIFY is not a serialiser — nothing produced by `JSON.stringify` of the file ever
 * reaches disk. It closes the one catastrophic failure: a splice that corrupts the encoded corpus.
 */
function rewriteFile(file, data, ids, result) {
  let text = readFileSync(file.path, 'utf8')
  // Buffered, not printed as we go: a later id can still throw on the raw splice or fail the
  // read-back, and `nothing written` must not follow lines that already announced a change.
  const changes = []
  for (const id of ids) {
    const was = data.mutations.find((m) => m.id === id).expectRed
    text = replaceExpectRed(text, id, result(id).observed)
    changes.push(
      `  ~ ${file.basename}${DATA_SUFFIX}  ${id}\n      was: ${was.join(' | ')}\n      now: ${result(id).observed.join(' | ')}`,
    )
  }
  let reparsed
  try {
    reparsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`${file.path}: rewrite produced invalid JSON — ${err.message}; nothing written`)
  }
  const problems = validateDataFile(reparsed, file.path)
  if (problems.length > 0) {
    throw new Error(
      `${file.path}: rewrite would not validate — ${problems.join('; ')}; nothing written`,
    )
  }
  writeFileSync(file.path, text)
  for (const line of changes) console.log(line)
}

/** Why a SURVIVED entry is never given a generated expectation. */
function reportSurvivor(file, id) {
  console.error(
    `  ! ${file.basename}${DATA_SUFFIX}  ${id} — SURVIVED: nothing went red, so there is no`,
  )
  console.error(
    '      observed set to write. The `find` anchor is a no-op or the test pins nothing — fix',
  )
  console.error('      the MUTATION, not the expectation. Nothing written for this id.')
}

async function modeUpdateExpected(root, guard, scratch, jobs) {
  const files = selectFiles(dataFiles(root), guard)
  if (firstDirtyFile(root, files)) return 2
  // Keyed by DATA FILE and id, never id alone. `validateDataFile` rejects a duplicate id within
  // ONE file and says nothing across files, and nine ids are in fact shared between the
  // check-prose-claims, check-prose-paths and check-file-size-guard corpora today. Keyed on the
  // id alone, a later file's result overwrites an earlier one and this mode splices one guard's
  // observed set into another guard's entry. `--guard` hides it: one file cannot collide.
  const keyOf = (file, id) => `${file}\u0000${id}`
  const graded = new Map()
  const runExit = await modeRun({
    root,
    guard,
    scratch,
    jobs,
    onResult: (r) => graded.set(keyOf(r.file, r.id), r),
  })
  if (runExit === 2) {
    console.error('\n✖ a mutation could not be graded — NO VERDICT, nothing written.')
    return 2
  }
  let written = 0
  let survivors = 0
  for (const file of files) {
    const tally = updateOneFile(file, (id) => graded.get(keyOf(file.path, id)))
    written += tally.written
    survivors += tally.survivors
  }
  return reportOutcome(written, survivors)
}

/** Rewrite one data file's MISMATCHes; report its SURVIVED entries and write nothing for them. */
function updateOneFile(file, result) {
  const data = loadDataFile(file)
  const ids = data.mutations.map((m) => m.id).filter((id) => result(id)?.status === 'MISMATCH')
  let survivors = 0
  for (const id of data.mutations.map((m) => m.id)) {
    if (result(id)?.status !== 'SURVIVED') continue
    survivors++
    reportSurvivor(file, id)
  }
  if (ids.length === 0) return { written: 0, survivors }
  rewriteFile(file, data, ids, result)
  return { written: ids.length, survivors }
}

/** 0 when something was written or there was nothing to do; 1 when a SURVIVED entry blocked it. */
function reportOutcome(written, survivors) {
  if (written > 0) {
    console.error(
      `\n${written} entr${written === 1 ? 'y' : 'ies'} rewritten. REVIEW THE DIFF before committing —`,
    )
    console.error('  a widened `expectRed` usually needs its `note` widened too; this writes the')
    console.error('  ARRAY only, because a generated justification is worth nothing.')
    // NOT `return 0`: the two conditions are independent, and a batch can carry both. A survivor
    // is a defect in the MUTATION, which `modeRun` exits 1 for — burying it behind a successful
    // rewrite reports exactly the hole this flag exists to surface as success.
    return survivors > 0 ? 1 : 0
  }
  if (survivors > 0) return 1
  console.error('\nevery gradeable mutation was already CAUGHT — nothing to update.')
  return 0
}

/**
 * Every selected data file's `{ file, data }`, at `ref`, staged-scoped when `staged`. Under
 * `--staged`, a file with no copy at `ref` (untracked, or removed from the index) is dropped —
 * `loadDataFileAt` returns null for it — before `filterByStagedScope` ever sees it.
 */
function loadScoped(root, files, ref, staged) {
  if (!staged) return files.map((file) => ({ file, data: loadDataFile(file) }))
  const loaded = files
    .map((file) => ({ file, data: loadDataFileAt(root, file, ref) }))
    .filter(({ data }) => data !== null)
  return filterByStagedScope(root, loaded, ref)
}

/**
 * Run `tasks` (zero-arg thunks returning a Promise) with at most `jobs` in flight at once.
 * Resolves to their results in INPUT order regardless of COMPLETION order.
 *
 * This is the whole reason R2 (byte-identical output for any `jobs`) holds: a task never prints
 * — `gradeOne` returns lines, it does not emit them — so concurrency changes only WHEN work
 * happens, never in what order it is reported. `gradeScoped` prints from this array afterward.
 */
export async function runPool(tasks, jobs) {
  const results = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, worker))
  return results
}

/**
 * A dangling id is a stale reference, and a stale reference is the same class of defect as a
 * stale anchor: it reads as coverage and grades nothing. Fail before anything is graded.
 */
function assertNoDanglingIds(scoped, root, readSuite) {
  for (const { data } of scoped) {
    const ids = new Set(data.mutations.map((m) => m.id))
    const problems = surveySuites(root, data, ids, readSuite).problems
    if (problems.length > 0) throw new Error(problems.join('\n  '))
  }
}

/** Flatten every `scoped` data file's mutations into one grading-task list, paired with owners. */
function buildGradeTasks(scoped, { root, base, ref }) {
  const tasks = []
  const owners = []
  for (const { file, data } of scoped) {
    for (const mut of data.mutations) {
      tasks.push(() => gradeOne({ root, data, mut, base, ref }))
      owners.push({ file, data })
    }
  }
  return { tasks, owners }
}

/** Print each result in input order and tally caught/bad/faults; calls `onResult` per grade. */
function tallyGradeResults(results, owners, onResult) {
  let caught = 0
  let bad = 0
  let faults = 0
  let currentFile = null
  for (let i = 0; i < results.length; i++) {
    const { file, data } = owners[i]
    if (file !== currentFile) {
      console.log(`\n${file.basename}${DATA_SUFFIX}  → ${data.target}`)
      currentFile = file
    }
    const { outcome, lines, result } = results[i]
    for (const line of lines) console.log(line)
    if (outcome === 'caught') caught++
    else if (outcome === 'bad') bad++
    else faults++
    if (result) onResult?.({ ...result, file: file.path })
  }
  return { caught, bad, faults }
}

/**
 * Grade every mutation in every `scoped` data file; tallies caught/bad/faults/total.
 *
 * Dangling-id validation runs for EVERY file up front, before any task is built — a stale
 * reference is caught before a single mutation runs, whatever `jobs` is. Grading itself runs
 * through `runPool`, so up to `jobs` mutations run at once; printing happens afterward, walking
 * the results in INPUT (data-file/mutation) order, so the report reads identically at any `jobs`.
 */
async function gradeScoped(scoped, { root, base, ref, readSuite, onResult, jobs }) {
  assertNoDanglingIds(scoped, root, readSuite)
  const { tasks, owners } = buildGradeTasks(scoped, { root, base, ref })
  const results = await runPool(tasks, jobs)
  const { caught, bad, faults } = tallyGradeResults(results, owners, onResult)
  return { caught, bad, faults, total: results.length }
}

/**
 * Resolve the ref, the candidate data files under it, and the staged-scoped subset of those
 * files, for one `modeRun` invocation. `ref` first: under `--staged` the CANDIDATE file list
 * itself comes from the ref (`dataFilesAt`), not from disk — so the ref must exist before files
 * can be selected.
 */
function resolveRunScope(root, guard, scratch, staged) {
  const ref = staged ? indexCommit(root) : 'HEAD'
  const files = selectFiles(staged ? dataFilesAt(root, ref) : dataFiles(root), guard)
  if (files.length === 0) {
    // NOT exit 0. Exit 0 asserts "every encoded mutation was CAUGHT"; a run that graded NOTHING
    // has earned no such claim. A data file emptied, renamed, or moved out of `.claude/hooks/`
    // would otherwise turn this oracle permanently green while checking nothing — the precise
    // failure mode the tool exists to detect in other people's tests.
    throw new Error('no *.mutations.json data files found — nothing graded, so no verdict')
  }
  const base = scratchBase(root, scratch)
  const scoped = loadScoped(root, files, ref, staged)
  return { ref, base, scoped }
}

/**
 * Grade every mutation of every selected data file.
 * @param opts.root       repository root; every git call and every path resolves against it
 * @param opts.guard      basename selecting ONE data file, or falsy for all of them
 * @param opts.scratch    where throwaway worktrees are made
 * @param opts.onResult   called once per GRADED mutation with `{ file, id, status, observed }`;
 *                        null for a plain run. Never called for a fault, which has no observed set.
 * @param opts.staged     grade the INDEX instead of HEAD, scoped to data files touching what is staged
 * @param opts.jobs       run up to this many mutations concurrently (default 1)
 */
async function modeRun({ root, guard, scratch, onResult = null, staged = false, jobs = 1 }) {
  const { ref, base, scoped } = resolveRunScope(root, guard, scratch, staged)
  if (scoped.length === 0) {
    console.log(
      '\nnothing staged touches a data file, its target, a suite, a helper a suite imports, or a path a suite names — nothing to grade',
    )
    return 0
  }
  const { caught, bad, faults, total } = await gradeScoped(scoped, {
    root,
    base,
    ref,
    readSuite: committedSuiteAt(ref),
    onResult,
    jobs,
  })
  console.log(
    `\n${total} mutations run, ${caught} caught, ${bad} survived-or-mismatched, ${faults} could not be graded`,
  )
  // Order matters and is NOT arbitrary. A fault outranks a survivor: exit 1 says "your TESTS have
  // a hole", exit 2 says "this RUN proves nothing". A batch with one of each is the second, and
  // reporting it as the first would send the reader to audit tests that were never graded.
  if (faults > 0) return 2
  return bad === 0 ? 0 : 1
}

export async function main(args) {
  const parsed = parseArgs(args)
  if (parsed.error) {
    console.error(`✖ mutation harness: ${parsed.error} — BLOCKING`)
    console.error('  usage: run-mutations.mjs [--list | --coverage | --update-expected] [--staged]')
    console.error('           [--guard <basename>] [--scratch <dir>] [--jobs <N>]')
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
  if (parsed.mode === 'update-expected') {
    return modeUpdateExpected(root, parsed.guard, parsed.scratch, parsed.jobs)
  }
  return modeRun({
    root,
    guard: parsed.guard,
    scratch: parsed.scratch,
    staged: parsed.staged,
    jobs: parsed.jobs,
  })
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main(argv.slice(2)).then(
    (code) => exit(code),
    (err) => {
      // Fail CLOSED at 2, never 1: see the exit-code rationale in the header. A harness fault
      // reported as a test finding gets remedied by deleting the test.
      console.error(`✖ mutation harness: could not run — NO VERDICT: ${err.message}`)
      console.error(
        '  This is a harness/environment failure, NOT evidence that a test is unpinned.',
      )
      exit(2)
    },
  )
}
