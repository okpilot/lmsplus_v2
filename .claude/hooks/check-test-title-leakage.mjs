#!/usr/bin/env node
// Mechanical guard (#946): forbid implementation-detail leakage in `it(...)` /
// `test(...)` titles, per code-style.md §7 "Disallowed in `it(...)` titles".
// The rule was tracked by the learner to count=5 across distinct commits; this
// shifts enforcement left from CR-local/code-reviewer (reactive, on the PR) to
// authoring time (pre-commit) + the CI lint job.
//
// GRANDFATHERED + DIFF-SCOPED (decision recorded on #946): only titles on ADDED
// (`+`) diff lines are checked. Pre-existing titles — e.g. the many
// `maps <token>` titles already in issue-code.test.ts and sibling action tests —
// are left untouched. A naive whole-file scan would block commits repo-wide, so
// this guard reads `git diff` and inspects only `+` lines.
//
// Two modes (run from the repo root):
//   node .claude/hooks/check-test-title-leakage.mjs <file> [file ...]   # staged mode (lefthook): diff each file against the index's HEAD (`git diff --cached`)
//   node .claude/hooks/check-test-title-leakage.mjs --base <ref>          # CI mode: diff the whole range <ref>...HEAD for *.test.{ts,tsx}
//
// The §7 "Permitted" forms (`calls onClick`, `calls signInWithPassword on valid
// submit`, `does not call the RPC when …`) are NOT matched by any pattern below:
// they use the verbs `calls` / `does not call`, which none of the disallowed
// patterns key on. The hook's unit test pins this (zero false positives on the
// Permitted examples).

import { execFileSync } from 'node:child_process'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

/**
 * The §7 disallowed-title patterns. Each entry: a regex tested against the title
 * text (the first string argument of `it(...)` / `test(...)`), plus a short
 * human label naming the leak. Patterns are deliberately keyed on verbs/shapes
 * that the §7 "Permitted" forms never use, so public props (`onClick`), public
 * SDK methods (`signInWithPassword`), and RPC names at the integration boundary
 * are not flagged.
 */
export const DISALLOWED_PATTERNS = [
  {
    // `forwards X to <InternalName>` — names an internal helper/hook/component.
    // Matches a camelCase name (lowercase start with an internal capital, e.g.
    // startQuizSession) or a PascalCase name (e.g. AnswerOptions) after `to`.
    // Plural `forwards` only — the singular `forward` is natural-language
    // navigation ("navigates forward to ResultsPage") and is not the §7 shape.
    re: /\bforwards\b.*\bto\s+([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]+)\b/,
    label:
      'forwards X to <InternalName> — names an internal helper/hook/component; describe the outcome, not the call',
  },
  {
    // `from <PascalCaseType>(Opts|Config|Args)` — names an internal input type.
    re: /\bfrom\s+[A-Z][A-Za-z0-9]*(Opts|Config|Args)\b/,
    label:
      'from <PascalCaseType>(Opts|Config|Args) — names an internal type; describe the populated output, not the input type',
  },
  {
    // `through <name>(` / `via <name>(` — names the function under test.
    re: /\b(through|via)\s+[a-z][A-Za-z0-9]*\(/,
    label:
      'through/via <name>( — names the function under test; the enclosing describe() already provides that context',
  },
  {
    // `(non-positive|typeof|isFinite|NaN) guard` — names a specific validator branch.
    re: /\b(non-positive|typeof|isFinite|NaN)\s+guard\b/,
    label:
      '<branch> guard — names a specific || branch in a validator; describe what input is rejected, not which branch fires',
  },
  {
    // `(activates|does not activate) the guard` — internal guard machinery.
    re: /\b(activates|does not activate)\s+the\s+guard\b/,
    label:
      'activates/does not activate the guard — names internal guard machinery; describe the user-observable consequence',
  },
  {
    // `matches <PascalCaseType>` — names a type (internal OR external library /
    // standard, e.g. ZodError, AuthError) instead of describing the result. The
    // §7 intent is behavior-first phrasing regardless of where the type is from.
    re: /\bmatches\s+[A-Z][A-Za-z0-9]+/,
    label:
      'matches <Type> — names a type (internal or external) instead of the observable result; describe the behavior (e.g. "rejects invalid input"), not the type it matches',
  },
  {
    // `maps <snake_case_token>` — a snake_case identifier (≥1 underscore): an
    // error code (admin_not_found) or a DB field (question_type). Either names an
    // internal token rather than the user-facing outcome of the mapping.
    re: /\bmaps\s+[a-z][a-z0-9]*(_[a-z0-9]+)+\b/,
    label:
      'maps <snake_case_token> — names a snake_case identifier (error code or DB field) instead of the user-facing outcome; describe what the user sees, not the token',
  },
]

/**
 * Test a single title string against the §7 patterns.
 * @param {string} title the it()/test() title text (without surrounding quotes)
 * @returns {string | null} the matched rule label, or null if the title is clean
 */
export function analyzeTitle(title) {
  for (const { re, label } of DISALLOWED_PATTERNS) {
    if (re.test(title)) return label
  }
  return null
}

// Matches `it('…')`, `it("…")`, `test(`…`)`, `it.each(...)('…')` openings and
// captures the title (group 4). Handles escaped quotes inside the title.
const TITLE_RE = /\b(it|test)(\.[A-Za-z0-9.()'"\s,[\]-]*)?\(\s*(['"`])((?:\\.|(?!\3).)*)\3/g

/**
 * Extract every it()/test() title literal that appears on ADDED diff lines,
 * with the new-file line number. Parses unified-diff text: hunk headers
 * (`@@ -a,b +c,d @@`) seed the new-file line counter.
 *
 * A contiguous run of `+` lines is joined into one buffer before matching, so a
 * split-form call — `it(` on one added line and the `'title'` literal on the
 * next — is still detected (TITLE_RE's `\s*` between `(` and the quote spans the
 * joined newline). The match is attributed to the source line where the
 * `it(`/`test(` token starts (newlines before the match index index the run).
 *
 * @param {string} diffText output of `git diff … -U0`
 * @returns {{ line: number, title: string }[]}
 */
export function extractAddedTitles(diffText) {
  const results = []
  let newLine = 0
  /** @type {{ text: string, line: number }[]} current contiguous run of added lines */
  let run = []
  const flush = () => {
    if (run.length === 0) return
    const buffer = run.map((r) => r.text).join('\n')
    TITLE_RE.lastIndex = 0
    let m = TITLE_RE.exec(buffer)
    while (m !== null) {
      // The line of the match = the run entry at the count of newlines before it.
      const nl = (buffer.slice(0, m.index).match(/\n/g) || []).length
      results.push({ line: run[nl].line, title: m[4] })
      m = TITLE_RE.exec(buffer)
    }
    run = []
  }
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('@@')) {
      flush() // a new hunk breaks the added run
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      if (m) newLine = Number(m[1])
      continue
    }
    if (raw.startsWith('+++') || raw.startsWith('---')) continue
    if (raw.startsWith('+')) {
      run.push({ text: raw.slice(1), line: newLine })
      newLine += 1
    } else if (!raw.startsWith('\\')) {
      // A removed line (or, only without -U0, a context line) breaks the added
      // run. Context lines also advance the new-file counter; removed lines do not.
      flush()
      if (!raw.startsWith('-')) newLine += 1
    }
  }
  flush()
  return results
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

const TEST_FILE_RE = /\.test\.(ts|tsx)$/

/** Match each added title in a multi-file diff against §7 (file from each `diff --git` header). */
function offendersFromDiff(diff) {
  const offenders = []
  for (const { file, body } of splitByFile(diff)) {
    for (const t of extractAddedTitles(body)) {
      const label = analyzeTitle(t.title)
      if (label) offenders.push({ file, line: t.line, title: t.title, label })
    }
  }
  return offenders
}

/** CI mode: diff the whole PR range (<base>...HEAD) for test files only. */
function collectOffendersCI(base) {
  if (!base) {
    console.error('✖ test-title guard: --base requires a ref argument')
    exit(2)
  }
  try {
    // git pathspec `*` already matches across `/` (no :(glob) magic), so a bare
    // `*.test.ts` recurses into subdirs — but spell it `**/*.test.ts` so the
    // recursion is explicit to a reader used to shell-glob (root-only) semantics.
    const diff = git([
      'diff',
      '--diff-filter=AM',
      '-U0',
      `${base}...HEAD`,
      '--',
      '**/*.test.ts',
      '**/*.test.tsx',
    ])
    return offendersFromDiff(diff)
  } catch (err) {
    console.error(`✖ test-title guard: git diff against ${base} failed: ${err.message}`)
    exit(2)
  }
}

/** Staged mode (lefthook): one `git diff --cached` per passed test file. */
function collectOffendersStaged(args) {
  const offenders = []
  for (const file of args.filter((p) => TEST_FILE_RE.test(p))) {
    let diff = ''
    try {
      diff = git(['diff', '--cached', '--diff-filter=AM', '-U0', '--', file])
    } catch (err) {
      // Fail CLOSED: a `git diff --cached` failure must not silently skip
      // enforcement (a real git error would let a violating title through).
      // A staged-deleted/renamed file does NOT error here — it yields an empty
      // or deletion diff with no added lines — so reaching this catch means an
      // actual git failure worth surfacing.
      console.error(`✖ test-title guard: git diff --cached for ${file} failed: ${err.message}`)
      exit(2)
    }
    for (const t of extractAddedTitles(diff)) {
      const label = analyzeTitle(t.title)
      if (label) offenders.push({ file, line: t.line, title: t.title, label })
    }
  }
  return offenders
}

/**
 * Dispatch to the CI (`--base <ref>`) or staged (file args) collector.
 * @returns {{ file: string, line: number, title: string, label: string }[]}
 */
function collectOffenders(args) {
  const baseIdx = args.indexOf('--base')
  if (baseIdx !== -1) return collectOffendersCI(args[baseIdx + 1])
  return collectOffendersStaged(args)
}

/**
 * Split a multi-file `git diff` into per-file bodies keyed by the new path.
 * @param {string} diff
 * @returns {{ file: string, body: string }[]}
 */
export function splitByFile(diff) {
  const out = []
  let current = null
  for (const line of diff.split('\n')) {
    const header = /^diff --git a\/.+ b\/(.+)$/.exec(line)
    if (header) {
      if (current) out.push(current)
      current = { file: header[1], body: '' }
    } else if (current) {
      current.body += `${line}\n`
    }
  }
  if (current) out.push(current)
  return out
}

function main() {
  const args = argv.slice(2)
  const offenders = collectOffenders(args)
  if (offenders.length > 0) {
    console.error(
      '✖ test-title impl-leakage guard (code-style.md §7): implementation detail in newly-added test title(s):',
    )
    for (const o of offenders) {
      console.error(`  ${o.file}:${o.line}  '${o.title}'`)
      console.error(`      → ${o.label}`)
    }
    console.error(
      '\nRename to describe externally observable behavior. See code-style.md §7 "Disallowed in it(...) titles".',
    )
    exit(1)
  }
  console.log('✓ test-title impl-leakage guard: no new violating titles')
}

// Run only when executed directly (not when the test imports the helpers).
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main()
}
