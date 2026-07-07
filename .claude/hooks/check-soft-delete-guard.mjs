#!/usr/bin/env node
// Mechanical guard (#925 Phase 3, schema-derived per #933): forbid `.is('<col>', …)`
// on a `.from('<table>')` where `<col>` is NOT an actual column of `<table>`, per the
// generated Supabase types (`packages/db/src/types.ts`, `public.Tables.<name>.Row`).
// The original RT bug — `.is('deleted_at', null)` on `easa_subjects` — reached
// production code and escaped every other gate; this guard makes that class of
// schema-contract bug impossible to reintroduce, and — being schema-derived rather
// than a hardcoded 7-table list — automatically protects any FUTURE no-`deleted_at`
// table (or any other column, not just `deleted_at`) without a guard update.
//
// Schema source of truth: `packages/db/src/types.ts` is generator-authoritative
// (`supabase gen types`). Only `public.Tables.<table>.Row` columns count — `Views`,
// `Functions`, and the `graphql_public` schema are ignored on purpose: a view or an
// RPC-result shape is not a `.from()`-queryable base table with column semantics we
// can safely assert here.
//
// Unknown-table policy (avoid false positives): if a `.from('<table>')` string
// literal is not a KNOWN base table (a view, a typo, or the generated types are
// stale), the whole chain is SKIPPED — never flagged. Under-flagging a rare case is
// a smaller harm than blocking a valid commit on a guard that can't see the schema.
//
// Chain-aware: a file may legitimately filter a real column on a soft-deletable (or
// any) table. A violation is only a query CHAIN that pairs a KNOWN table's
// `.from('<table>')` with an `.is('<col>'` in the SAME chain where `<col>` is absent
// from that table's Row columns. Adjacent chains (e.g. an `easa_topics` read next to
// an `exam_configs` read in one Promise.all) are correctly separated.
//
// Known limitations (acceptable for a mechanical guard):
//   - A table name held in a variable (`.from(tbl)`) or a template literal is not
//     matched (string-literal only) — the query-builder-parameter pattern in
//     apps/web/app/app/admin/internal-exams/{queries,attempts-queries}.ts (a
//     `builder: OffsetChainBuilder` param chained with `.is(...)`) is this case;
//     the `.from()` lives in a different function, so the segment is skipped.
//   - Query chains inside template interpolation (`${sb.from(...).is(...)}`) are
//     likewise not detected (interpolated code is treated as string content).
//   - A dot-qualified embedded/joined-resource filter — `.is('quiz_sessions.ended_at', …)`
//     — is not matched by the column regex (`[A-Za-z0-9_]+`, no `.`), so it is
//     silently skipped rather than checked against the joined table's columns.
//   - The schema snapshot is whatever `packages/db/src/types.ts` says at guard-run
//     time — regenerate types after a migration before relying on this guard to
//     catch a newly-dropped column.
//
// Usage:
//   node .claude/hooks/check-soft-delete-guard.mjs [file ...]   # scan given files (lefthook staged mode; non-existent paths skipped)
//   node .claude/hooks/check-soft-delete-guard.mjs              # scan the default production globs (CI mode)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { argv, exit } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Resolved relative to this file: .claude/hooks/ -> repo root -> packages/db/src/types.ts
const TYPES_PATH = fileURLToPath(new URL('../../packages/db/src/types.ts', import.meta.url))

// Production roots scanned in no-args (CI) mode, relative to repo root.
// packages/ui (React components) and packages/typescript-config hold no Supabase
// queries; extend this list if a new package ever adds DB access.
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

const FROM_CALL = /\.from\((['"])([A-Za-z0-9_]+)\1\)/
const IS_CALL = /\.is\((['"])([A-Za-z0-9_]+)\1/g

/**
 * Find the index of the `}` that closes the `{` at `openIndex`, via a plain
 * brace-depth scan. Generated `types.ts` has no string/template literals containing
 * `{`/`}` inside the `Database`/`Tables` region, so a naive char scan (no
 * string-awareness) is sufficient and fast. Returns -1 if unbalanced.
 */
function findMatchingBrace(source, openIndex) {
  let depth = 0
  for (let i = openIndex; i < source.length; i++) {
    const c = source[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Strip a single pair of surrounding `'...'` / `"..."` quotes, if present. */
function stripQuotes(s) {
  const first = s[0]
  const last = s[s.length - 1]
  if ((first === "'" || first === '"') && first === last && s.length >= 2) {
    return s.slice(1, -1)
  }
  return s
}

/**
 * Scan `text` at brace/bracket depth 0 for entries of the shape `key: { ... }`
 * (object-valued members only — e.g. a table entry, or its `Row`/`Insert` members).
 * Depth also tracks `[...]` and `(...)` so array/tuple-valued sibling members
 * (e.g. `Relationships: [...]`) don't desync the brace count.
 *
 * @returns {{ key: string, blockText: string }[]}
 */
function extractObjectEntries(text) {
  const entries = []
  const keyRe = /^([A-Za-z_][A-Za-z0-9_]*|'[^']*'|"[^"]*")\s*:\s*\{/
  let depth = 0
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '{' || c === '[' || c === '(') {
      depth++
      i++
      continue
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--
      i++
      continue
    }
    if (depth === 0) {
      const m = keyRe.exec(text.slice(i))
      if (m) {
        const key = stripQuotes(m[1])
        const openBrace = i + m[0].length - 1
        const closeBrace = findMatchingBrace(text, openBrace)
        if (closeBrace === -1) break
        entries.push({ key, blockText: text.slice(openBrace + 1, closeBrace) })
        i = closeBrace + 1
        continue
      }
    }
    i++
  }
  return entries
}

/**
 * Scan `text` (the inside of a `Row: { ... }` block) at depth 0 for every member
 * key, regardless of its value's shape (`string`, `string | null`, `Json`,
 * `unknown`, `number[]`, etc.) — unlike `extractObjectEntries`, the value need not
 * be object-valued.
 *
 * @returns {string[]}
 */
function extractTopLevelKeys(text) {
  const keys = []
  const keyRe = /^([A-Za-z_][A-Za-z0-9_]*|'[^']*'|"[^"]*")\s*\??\s*:/
  let depth = 0
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '{' || c === '[' || c === '(') {
      depth++
      i++
      continue
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--
      i++
      continue
    }
    if (depth === 0) {
      const m = keyRe.exec(text.slice(i))
      if (m) {
        keys.push(stripQuotes(m[1]))
        i += m[0].length
        continue
      }
    }
    i++
  }
  return keys
}

/**
 * Parse `packages/db/src/types.ts` into `Map<tableName, Set<columnName>>` covering
 * only `public.Tables.<table>.Row` columns (Views/Functions/graphql_public ignored).
 *
 * @param {string} typesSource
 * @returns {Map<string, Set<string>>}
 */
export function loadSchema(typesSource) {
  const tables = new Map()
  // The FIRST `\n  public: {` in the file is the `Database` type's public schema
  // (a second, unrelated `public: {` appears later in the file inside the
  // `export const Constants = { ... }` block — that one is never reached first).
  const publicIdx = typesSource.indexOf('\n  public: {')
  if (publicIdx === -1) return tables
  const publicOpenBrace = typesSource.indexOf('{', publicIdx)
  const publicCloseBrace = findMatchingBrace(typesSource, publicOpenBrace)
  if (publicCloseBrace === -1) return tables
  const publicInner = typesSource.slice(publicOpenBrace + 1, publicCloseBrace)

  const publicEntries = extractObjectEntries(publicInner)
  const tablesEntry = publicEntries.find((e) => e.key === 'Tables')
  if (!tablesEntry) return tables

  const tableEntries = extractObjectEntries(tablesEntry.blockText)
  for (const { key: tableName, blockText: tableBlock } of tableEntries) {
    const tableMembers = extractObjectEntries(tableBlock)
    const rowEntry = tableMembers.find((e) => e.key === 'Row')
    if (!rowEntry) continue
    tables.set(tableName, new Set(extractTopLevelKeys(rowEntry.blockText)))
  }
  return tables
}

const SCHEMA = loadSchema(readFileSync(TYPES_PATH, 'utf8'))

/**
 * Strip `//` line and block comments (markers inside string/template literals are
 * NOT treated as comments) and, in parallel, build an `inStr` mask marking every
 * offset that sits inside a string/template literal. Output length equals input
 * length, so offsets map to original line numbers and the mask aligns with both.
 *
 * The mask lets the analyzer require a `.from(` / `.is(` call TOKEN to be at code
 * level while still reading the table name / column name that live inside the
 * argument strings — so a whole `.from('x').is('bad_col')` pattern embedded in
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
 * begins at every `.from(` / `.rpc(` and after every `;`, so a `.is('<col>')`
 * stays attached to the `.from()` that precedes it in the same chain, and an
 * adjacent sibling `.from()` / `.rpc()` starts a fresh segment.
 *
 * `.rpc(` is a boundary so that two adjacent statements separated only by a
 * newline — `await sb.from('audit_events')…` then `await sb.rpc('fn').is('deleted_at')`
 * — do not merge into one segment and false-positive. (`.from(...).rpc(...)` mid-chain
 * is not valid Supabase JS, so the resulting non-flag of that shape can't occur in
 * real code; it is not a concern.)
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
 * @returns {{ table: string, column: string, line: number }[]} one entry per offending
 *   `.is('<col>')` (col absent from the table); `line` is the `.from()` that establishes the table
 */
export function analyze(source) {
  const { clean, inStr } = stripComments(source)
  const starts = lineStarts(source)
  const bounds = segmentOffsets(clean, inStr)
  const violations = []
  for (let k = 0; k < bounds.length - 1; k++) {
    const base = bounds[k]
    const segment = clean.slice(base, bounds[k + 1])
    const from = FROM_CALL.exec(segment)
    // The `.from(` token must be real code (not inside a string) and the table
    // must be a KNOWN base table — otherwise skip the whole segment (never flag
    // an unmodeled view / typo / stale-schema table).
    if (from === null) continue
    if (inStr[base + from.index] !== 0) continue
    const table = from[2]
    const columns = SCHEMA.get(table)
    if (!columns) continue // unknown table (view / typo / stale schema) — skip, never flag

    IS_CALL.lastIndex = 0
    let isMatch = IS_CALL.exec(segment)
    while (isMatch !== null) {
      // Skip a `.is(` token that is inside a string literal, not real code.
      if (inStr[base + isMatch.index] !== 0) {
        isMatch = IS_CALL.exec(segment)
        continue
      }
      const column = isMatch[2]
      if (!columns.has(column)) {
        violations.push({ table, column, line: lineForOffset(starts, base + from.index) })
      }
      isMatch = IS_CALL.exec(segment)
    }
  }
  return violations
}

function shouldScan(path) {
  if (!/\.(ts|tsx)$/.test(path)) return false
  // `*.integration.test.ts` is covered by this `.test.ts` suffix check.
  if (/\.test\.(ts|tsx)$/.test(path)) return false
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
  const files = collectFiles(argv.slice(2))
  const offenders = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const v of analyze(source)) {
      offenders.push(
        `${file}:${v.line}  — '${v.table}' has no '${v.column}' column; remove or fix the filter`,
      )
    }
  }
  if (offenders.length > 0) {
    console.error('✖ soft-delete/schema column guard: .is(<col>) on unknown column(s):')
    for (const line of offenders) console.error(`  ${line}`)
    console.error(
      '\nEach flagged column does not exist on the flagged table per packages/db/src/types.ts. See .claude/hooks/check-soft-delete-guard.mjs.',
    )
    exit(1)
  }
  console.log(`✓ soft-delete/schema column guard: ${files.length} file(s) clean`)
}

// Run only when executed directly (not when the test imports `analyze`).
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main()
}
