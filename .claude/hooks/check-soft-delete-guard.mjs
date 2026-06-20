#!/usr/bin/env node
// Mechanical guard (#925 Phase 3): forbid `.is('deleted_at', …)` on tables that
// have no `deleted_at` column. The original RT bug — `.is('deleted_at', null)` on
// `easa_subjects` — reached production code and escaped every other gate; this
// guard makes that class of schema-contract bug impossible to reintroduce.
//
// Chain-aware: a file may legitimately filter `deleted_at` on soft-deletable
// tables (148 such call sites exist). A violation is only a query CHAIN that pairs
// a forbidden table's `.from('<table>')` with a `.is('deleted_at'` in the SAME
// chain. Adjacent chains (e.g. an `easa_topics` read next to an `exam_configs`
// read in one Promise.all) are correctly separated.
//
// Known limitation (acceptable for a mechanical guard): a table name held in a
// variable — `.from(tbl)` — or a template literal is not matched (string-literal
// only). The Phase-4 schema-aware successor covers the general case.
//
// Usage:
//   node .claude/hooks/check-soft-delete-guard.mjs [file ...]   # scan given files (lefthook staged mode; non-existent paths skipped)
//   node .claude/hooks/check-soft-delete-guard.mjs              # scan the default production globs (CI mode)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { argv } from 'node:process'
import { pathToFileURL } from 'node:url'

export const NO_SOFT_DELETE_TABLES = [
  'easa_subjects',
  'easa_topics',
  'easa_subtopics',
  'quiz_session_answers',
  'student_responses',
  'audit_events',
  'quiz_drafts',
]

// Production roots scanned in no-args (CI) mode, relative to repo root.
const SCAN_ROOTS = ['apps/web', 'packages/db/src']

// Path fragments that exclude a file from scanning. Test + integration-support +
// operational scripts are not production query code.
const EXCLUDE_FRAGMENTS = [
  'node_modules',
  '/.next/',
  '/__integration__/',
  '/e2e/',
  '/scripts/',
  '/lib/integration-support/',
]

const FORBIDDEN_FROM = new RegExp(`\\.from\\((['"])(${NO_SOFT_DELETE_TABLES.join('|')})\\1\\)`)
const DELETED_AT_IS = /\.is\((['"])deleted_at\1/

/**
 * Strip `//` line and block comments (markers inside string/template literals are
 * NOT treated as comments) and, in parallel, build an `inStr` mask marking every
 * offset that sits inside a string/template literal. Output length equals input
 * length, so offsets map to original line numbers and the mask aligns with both.
 *
 * The mask lets the analyzer require a `.from(` / `.is(` call TOKEN to be at code
 * level while still reading the table name / `'deleted_at'` that live inside the
 * argument strings — so a whole `.from('x').is('deleted_at')` pattern embedded in
 * an outer string literal is correctly ignored.
 *
 * @returns {{ clean: string, inStr: Uint8Array }}
 */
function stripComments(source) {
  const out = new Array(source.length)
  const inStr = new Uint8Array(source.length)
  let state = 'code'
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (state === 'code') {
      if (c === '/' && next === '/') {
        state = 'line'
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      } else if (c === '/' && next === '*') {
        state = 'block'
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      } else if (c === "'" || c === '"' || c === '`') {
        state = c
        out[i] = c
        inStr[i] = 1
        i += 1
      } else {
        out[i] = c
        i += 1
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out[i] = c
      } else {
        out[i] = ' '
      }
      i += 1
    } else if (state === 'block') {
      if (c === '*' && next === '/') {
        state = 'code'
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      } else {
        out[i] = c === '\n' ? '\n' : ' '
        i += 1
      }
    } else {
      // Inside a string/template literal (state holds the opening quote char).
      if (c === '\\') {
        out[i] = c
        inStr[i] = 1
        if (i + 1 < source.length) {
          out[i + 1] = next
          inStr[i + 1] = 1
        }
        i += 2
      } else {
        out[i] = c
        inStr[i] = 1
        if (c === state) state = 'code'
        i += 1
      }
    }
  }
  return { clean: out.join(''), inStr }
}

function lineStarts(source) {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function lineForOffset(starts, offset) {
  // Binary search: largest index whose start <= offset.
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/**
 * Split the (comment-stripped) source into query-chain segments. A new segment
 * begins at every `.from(` / `.rpc(` and after every `;`, so a `.is('deleted_at')`
 * stays attached to the `.from()` that precedes it in the same chain, and an
 * adjacent sibling `.from()` starts a fresh segment.
 */
function segmentOffsets(clean, inStr) {
  const boundaries = new Set([0, clean.length])
  const re = /\.from\(|\.rpc\(|;/g
  let m = re.exec(clean)
  while (m !== null) {
    // Ignore boundaries that fall inside a string literal.
    if (inStr[m.index] === 0) boundaries.add(m[0] === ';' ? m.index + 1 : m.index)
    m = re.exec(clean)
  }
  return [...boundaries].sort((a, b) => a - b)
}

/**
 * @param {string} source raw file contents
 * @returns {{ table: string, line: number }[]} one entry per offending chain
 */
export function analyze(source) {
  const { clean, inStr } = stripComments(source)
  const starts = lineStarts(source)
  const bounds = segmentOffsets(clean, inStr)
  const violations = []
  for (let k = 0; k < bounds.length - 1; k++) {
    const base = bounds[k]
    const segment = clean.slice(base, bounds[k + 1])
    const from = FORBIDDEN_FROM.exec(segment)
    const is = DELETED_AT_IS.exec(segment)
    // Both call tokens must be real code (their leading `.` not inside a string),
    // so a `.from(...).is('deleted_at')` pattern embedded in a string is ignored.
    if (
      from !== null &&
      is !== null &&
      inStr[base + from.index] === 0 &&
      inStr[base + is.index] === 0
    ) {
      violations.push({
        table: from[2],
        line: lineForOffset(starts, base + from.index),
      })
    }
  }
  return violations
}

function shouldScan(path) {
  if (!/\.(ts|tsx)$/.test(path)) return false
  if (/\.test\.(ts|tsx)$/.test(path)) return false
  if (/\.integration\.test\.ts$/.test(path)) return false
  const normalized = `/${path.replace(/\\/g, '/')}`
  return !EXCLUDE_FRAGMENTS.some((frag) => normalized.includes(frag))
}

function walk(dir, acc) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, acc)
    } else if (shouldScan(full)) {
      acc.push(full)
    }
  }
}

function collectFiles(args) {
  if (args.length > 0) {
    // Staged mode: only the paths lefthook passed, skipping any that no longer
    // exist on disk (deleted / renamed staged files) and any excluded path.
    return args.filter((p) => existsSync(p) && shouldScan(p))
  }
  const acc = []
  for (const root of SCAN_ROOTS) walk(root, acc)
  return acc
}

function main() {
  const files = collectFiles(process.argv.slice(2))
  const offenders = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const v of analyze(source)) {
      offenders.push(
        `${file}:${v.line}  — '${v.table}' has no deleted_at column; remove the soft-delete filter`,
      )
    }
  }
  if (offenders.length > 0) {
    console.error(
      '✖ soft-delete column guard: forbidden .is(deleted_at) on no-soft-delete table(s):',
    )
    for (const line of offenders) console.error(`  ${line}`)
    console.error(
      `\n${NO_SOFT_DELETE_TABLES.join(', ')} have no deleted_at column. See .claude/hooks/check-soft-delete-guard.mjs.`,
    )
    process.exit(1)
  }
  console.log(`✓ soft-delete column guard: ${files.length} file(s) clean`)
}

// Run only when executed directly (not when the test imports `analyze`).
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main()
}
