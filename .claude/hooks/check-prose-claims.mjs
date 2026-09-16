#!/usr/bin/env node

// Mechanical guard: block a `.claude/limits.json` cap VALUE being restated in PROSE as a
// claim about that cap. `.claude/rules/code-style.md` §1 says "Limits are data ... Never
// restate a number here", and until this guard nothing enforced it — the caps had already
// been copied into nine hand-maintained places once, which is why they became data at all.
// Prose goes stale silently; `limits.json` is the only copy that is executed.
//
// Usage:  node .claude/hooks/check-prose-claims.mjs                 (pre-commit; staged)
//         node .claude/hooks/check-prose-claims.mjs --all           (CI; whole worktree)
//         node .claude/hooks/check-prose-claims.mjs --update-baseline
// Exit:   0 = no unbaselined prose claim, no stale baseline row
//         1 = a finding — a new prose claim, a stale row, or an unusable waiver
//         2 = the check COULD NOT RUN (usage, git failure, unreadable limits/baseline)
//
// Why 1 and 2 are separate. This guard ships an inline suppression marker. If "could not
// run" and "you restated a cap" shared exit 1, the cheapest way past a BROKEN INVOCATION —
// an unreadable `limits.json`, a git failure — would be to write a permanent
// `prose-claim-ok` waiver, which would then sit in the corpus forever recording a finding
// that never existed while the guard reported green having read nothing. Exit 2 makes the
// waiver structurally unavailable as a remedy, and the message at the bottom of this file
// says so out loud. Do not collapse them.
//
// THE THREE NARROWINGS, all measured. Each exists because dropping it floods the run:
//   1. PROSE LINES ONLY. In markdown, lines outside fenced and indented code blocks; in
//      code files, comment lines only. The largest noise class is `"max": 500` and its
//      fixtures in the hook suites — data, not prose, and `code-style.md` §1's ban is on
//      prose. This also exempts `.coderabbit.yaml`'s `path_instructions` strings by
//      construction, which is correct: that mirror is KEPT deliberately (CodeRabbit cannot
//      follow a pointer) and is machine-verified by
//      `check-file-size-guard.update.test.mjs`, so it is pinned rather than drifting.
//      `.claude/limits.json` itself is JSON — no comment lines, so the canonical file can
//      never flag itself.
//   2. CONTEXT, not a bare value. The number must carry the `<N>-line` / `<N> lines` shape
//      AND a cap word or a rule-KIND word (derived from `limits.json`, never typed here).
//      A bare `500` is the commonest integer in the corpus.
//   3. PROXIMITY. The context word must sit within PROXIMITY characters of the number, not
//      merely somewhere on the same line. Without this bound the dominant false positives
//      were long markdown table rows and SQL snippets, where an unrelated `200 lines` and
//      an unrelated "limit" share one physical line.
// Plus the ratio shape `<n>/<N> lines`, where the word "line" is REQUIRED within the same
// proximity bound: unrequired it matched SQL column arithmetic and date fragments.
//
// KNOWN BOUNDS, stated because understating them would be this guard's own defect:
//   - it cannot see a spelled-out number ("three hundred lines");
//   - it cannot see a paraphrase ("twice the component cap");
//   - it cannot see a claim ABOUT a cap that never names the number;
//   - it says nothing about whether a flagged claim is TRUE — only that prose is asserting
//     a number the data file owns.
// It reduces the class; it does not close it.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MAX_BUFFER = 64 * 1024 * 1024

const LIMITS_PATH = '.claude/limits.json'
const BASELINE_PATH = '.claude/prose-claims.json'
const GUARD = '.claude/hooks/check-prose-claims.mjs'

/**
 * The prose corpus. Identical in spirit to `check-retracted-phrase.mjs`'s: this programme is
 * about rule and doc prose, and application code restating a cap is a different (and far
 * rarer) problem that the file-size guard already grades directly.
 */
const CORPUS = ['CLAUDE.md', '.coderabbit.yaml', '.claude/', 'docs/', '.spec-workflow/']

/**
 * Agent memory NARRATES past claims verbatim — a tracker row quoting a cap value is a record
 * of what was once written, not a live restatement. Same exclusion, same reason, as
 * the retracted-phrase guard.
 */
const MEMORY_PREFIX = '.claude/agent-memory/'

/**
 * A dated append-only log of what happened on a given day. Same class as agent memory: an
 * entry saying a file was split to get under its cap is history, and history cannot be
 * corrected into a pointer. Excluded by exact path, not by prefix, so a future `.claude/run-log/` tree
 * would have to be added deliberately rather than inherited.
 */
const EXCLUDED_PATHS = new Set(['.claude/run-log.md'])

/** How near the context word must sit to the number. Calibrated; see narrowing 3. */
const PROXIMITY = 26

const KNOWN_FLAGS = new Set(['--all', '--update-baseline'])

/** Extensions whose COMMENT lines are prose. Everything else in the corpus has none. */
const COMMENT_EXT = new Set(['.mjs', '.cjs', '.js', '.ts', '.mts', '.sh', '.yaml', '.yml'])

const COMMENT_RE = /^\s*(?:\/\/|#|\*|\/\*)/

/** Words that make a number a claim about a CAP rather than an incidental count. */
const CAP_WORDS = [
  'cap',
  'caps',
  'capped',
  'limit',
  'limits',
  'limited',
  'max',
  'maximum',
  'ceiling',
  'budget',
]

/**
 * Kind words the rule set does not spell out. `limits.json` names the kinds it enforces, but
 * prose habitually uses the short form ("the util cap", "the component cap"), and a kind word
 * that only ever appears in its long form would leave the commonest phrasing unmatched.
 */
const EXTRA_KIND_WORDS = ['component', 'util', 'helper', 'migration', 'hook', 'page']

/** Reasons that assert nothing. A waiver must say WHY the prose must carry the number. */
const EMPTY_REASONS = new Set([
  'false positive',
  'falsepositive',
  'noise',
  'na',
  'n a',
  'not applicable',
  'ok',
  'fine',
  'intentional',
  'known',
  'skip',
  'wontfix',
  'ignore',
])

// ---------------------------------------------------------------- derivation from limits

/**
 * The cap values under enforcement. Derived, never typed: a literal list here would be the
 * exact defect this guard exists to stop, committed inside the guard.
 *
 * THROWS on an empty result. A limits file whose `rules` went missing would otherwise make
 * every claim unrecognisable and the guard would report green having graded nothing.
 */
export function capValues(limits) {
  const caps = new Set()
  for (const rule of limits?.rules ?? []) {
    if (Number.isInteger(rule?.max)) caps.add(rule.max)
  }
  if (caps.size === 0) {
    throw new Error(`${LIMITS_PATH} yielded no integer rules[].max — nothing to enforce`)
  }
  return caps
}

/** Kind words: every word of every `rules[].kind`, plus the short forms above. */
export function kindWords(limits) {
  const words = new Set(EXTRA_KIND_WORDS)
  for (const rule of limits?.rules ?? []) {
    for (const word of String(rule?.kind ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)) {
      if (word.length >= 3) words.add(word)
    }
  }
  return words
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One alternation over cap words and kind words. Global + case-insensitive. */
export function contextRe(limits) {
  const words = [...new Set([...CAP_WORDS, ...kindWords(limits)])].sort(
    (a, b) => b.length - a.length,
  )
  return new RegExp(`\\b(?:${words.map(escapeRe).join('|')})\\b`, 'gi')
}

// ---------------------------------------------------------------- prose extraction

/**
 * Markdown prose lines, as `{ n, text }` with `n` 1-based.
 *
 * Skipped: fenced blocks (``` / ~~~, any fence length, any info string) and indented code
 * blocks. The indented-block test is deliberately coarse — four or more leading spaces —
 * with ONE carve-out for lines that are plainly list continuations (a marker, a blockquote,
 * or a table row after the indent). Over-skipping costs coverage; under-skipping costs
 * precision, and precision is what makes a guard survive its first week.
 */
export function markdownProse(content) {
  const out = []
  let fence = null
  content.split('\n').forEach((line, i) => {
    const fenceOpen = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      // A closer must be at least as long as its opener and of the same character.
      // The closer must ALSO carry nothing but whitespace after its marker. Without that,
      // an INNER opener like ```js closes the outer fence and every following line is graded
      // as prose — the guard would then read code as claims, which is the noisiest possible
      // failure. CommonMark requires it; the first cut checked only length and character.
      const closes =
        fenceOpen &&
        fenceOpen[1][0] === fence[0] &&
        fenceOpen[1].length >= fence.length &&
        line.slice(fenceOpen[0].length).trim() === ''
      if (closes) fence = null
      return
    }
    if (fenceOpen) {
      fence = fenceOpen[1]
      return
    }
    if (/^(?: {4,}|\t)/.test(line) && !/^[ \t]+(?:[-*+>|]|\d+[.)])(?:\s|$)/.test(line)) return
    out.push({ n: i + 1, text: line })
  })
  return out
}

/**
 * Comment lines of a code file, as `{ n, text }`.
 *
 * Tracks BLOCK-comment state rather than matching each line's leading marker. A `/* ... *\/`
 * whose body carries no leading `*` is valid, common, and was invisible to the first cut — so a
 * sentence restating a utility cap, written inside one, bypassed the guard entirely. Found by
 * cloud review, reproduced before fixing. (This sentence originally CARRIED the value it
 * describes, and this guard blocked its own commit for it.) The trailing-comment case (`code(); // note`) stays
 * EXCLUDED: a comment after source is not prose, and admitting it is how a guard starts
 * grading code.
 */
export function commentProse(content) {
  const out = []
  let inBlock = false
  content.split('\n').forEach((line, i) => {
    // A block opens ONLY when the line BEGINS with the marker. A bare indexOf finds `/*` inside
    // a string or a regex too, and a first cut of this fix did exactly that: one test fixture
    // opened a phantom block and every line after it was graded as prose, flooding the run with
    // 17 false findings — including `.coderabbit.yaml`'s deliberately pinned mirror. Over-reach
    // is the worse failure: under-reach misses a claim, over-reach grades code as prose and
    // trains the reader to waive. The narrower rule still covers the reported hole, whose body
    // sits under an opener at column 0.
    const opens = /^\s*\/\*/.test(line)
    const closes = line.includes('*/')
    if (inBlock) {
      out.push({ n: i + 1, text: line })
      if (closes) inBlock = false
      return
    }
    if (COMMENT_RE.test(line)) {
      out.push({ n: i + 1, text: line })
      if (opens && !closes) inBlock = true
    }
  })
  return out
}

const extOf = (path) => {
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  return dot > slash ? path.slice(dot) : ''
}

/** Prose lines of one corpus file. A file with no prose form yields none — not an error. */
export function proseLines(path, content) {
  const ext = extOf(path)
  if (ext === '.md') return markdownProse(content)
  if (COMMENT_EXT.has(ext)) return commentProse(content)
  return []
}

// ---------------------------------------------------------------- claim detection

/**
 * `500-line`, `500 lines`, `500 line`. The lookbehind rejects a number glued to a word, a
 * decimal fragment, a `#`-prefixed ticket and a hyphenated range's tail, each of which
 * produced hits in calibration. The separator must be present: `500lines` is not a claim.
 */
const LINE_SHAPE = /(?<![\w.$#-])(\d{2,5})(?:\s*-\s*|\s+)lines?\b/gi

/** `7/500` — the compliance-ratio shape. The second number is the cap. */
const RATIO_SHAPE = /(?<![\w.$#-])(\d{1,5})\s*\/\s*(\d{2,5})(?![\w.])/g

/** The word "line"/"lines" standing alone — the ratio shape's required adjacent token. */
const LINE_WORD_RE = /\blines?\b/gi

/** Character gap between two `[start, end)` spans; 0 when they overlap. */
function gap(aStart, aEnd, bStart, bEnd) {
  if (bStart >= aEnd) return bStart - aEnd
  if (aStart >= bEnd) return aStart - bEnd
  return 0
}

/** Is any match of `re` within PROXIMITY of `[start, end)`? */
function nearby(line, re, start, end) {
  re.lastIndex = 0
  for (const m of line.matchAll(re)) {
    if (gap(start, end, m.index, m.index + m[0].length) <= PROXIMITY) return true
  }
  return false
}

/**
 * Claims on ONE line. `caps` is the derived value set; `ctxRe` the derived context
 * alternation. Returns `{ value, shape, index }` per hit.
 */
export function findClaims(line, caps, ctxRe) {
  const claims = []
  for (const m of line.matchAll(LINE_SHAPE)) {
    const value = Number(m[1])
    if (!caps.has(value)) continue
    if (!nearby(line, ctxRe, m.index, m.index + m[0].length)) continue
    claims.push({ value, shape: 'line-count', index: m.index })
  }
  for (const m of line.matchAll(RATIO_SHAPE)) {
    const value = Number(m[2])
    if (!caps.has(value)) continue
    // "line" is REQUIRED here and not optional context: without it the shape matched SQL
    // arithmetic and date fragments, which was the whole reason the ratio shape nearly got
    // dropped. The cap/kind word is NOT sufficient on its own for this shape.
    if (!nearby(line, LINE_WORD_RE, m.index, m.index + m[0].length)) continue
    claims.push({ value, shape: 'ratio', index: m.index })
  }
  return claims
}

// ---------------------------------------------------------------- waivers

const WAIVER_RE = /(?:<!--|\/\/|#)\s*prose-claim-ok:\s*(.*?)\s*(?:-->)?\s*$/

/**
 * The inline escape hatch, on the flagged line itself. Returns `null` when absent,
 * `{ reason }` when usable, `{ problem }` when the reason asserts nothing.
 *
 * A waiver must COST something. It is greppable, it is visible in the diff that introduces
 * it, and it carries a written reason — there is no flag, no env var and no allowlist file,
 * because each of those moves the cost away from the line whose claim is being excused.
 */
export function parseWaiver(text) {
  const m = WAIVER_RE.exec(text)
  if (!m) return null
  const reason = m[1]
  const bare = reason
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
  if (reason.replace(/\s/g, '').length < 20 || EMPTY_REASONS.has(bare)) {
    return {
      problem: `the reason must state WHY this prose must carry the number (>= 20 chars, not a bare "${reason}")`,
    }
  }
  return { reason }
}

// ---------------------------------------------------------------- baseline keys

/**
 * A claim's baseline key: path plus a content hash of the TRIMMED line.
 *
 * NOT path + line number. Prose line numbers drift on every edit made above them, so a
 * line-keyed baseline would go stale on edits that never touched the claim — and the
 * remedy for that noise would be to stop reading the baseline. The unit under baseline for
 * prose is the LINE TEXT, and a content hash is its exact analogue of the file-size guard's
 * recorded line count. Replacing a baselined line therefore yields a stale row (reported)
 * AND a new violation (caught), which is the intended pair.
 */
export function claimKey(path, text, occurrence = 0) {
  const digest = createHash('sha256').update(text.trim(), 'utf8').digest('hex').slice(0, 16)
  // The occurrence suffix is what keeps a SECOND identical restatement from inheriting the
  // first one's baseline row. Keyed on path+text alone, copy two of the same sentence in the
  // same file collapsed onto copy one's key and passed — a hole found by cloud review and
  // reproduced before fixing. Occurrence 0 keeps its bare key so existing baseline rows,
  // which are the overwhelming majority, are not all invalidated at once.
  return occurrence === 0 ? `${path}@${digest}` : `${path}@${digest}#${occurrence}`
}

/** A short, reviewable excerpt stored as the baseline row's VALUE. */
const excerpt = (text) => {
  const t = text.trim()
  return t.length > 120 ? `${t.slice(0, 117)}...` : t
}

// ---------------------------------------------------------------- evaluation

/**
 * Evaluate every corpus file.
 * @returns {{claims: Map<string, object>, problems: Array<object>}}
 *   `claims` is keyed by `claimKey`; waived and unwaived claims alike are EXCLUDED once
 *   waived, so a waived line is not silently also a baseline row.
 */
export function evaluate(files, readFile, limits) {
  const caps = capValues(limits)
  const ctxRe = contextRe(limits)
  const claims = new Map()
  const seen = new Map()
  const problems = []

  for (const path of files) {
    let content
    try {
      content = readFile(path)
    } catch (err) {
      // Every path here came from `git ls-files`, so git asserts it exists. A read failure
      // means the tree changed underneath the run, or a permission bit did — either way the
      // answer is untrustworthy. FAIL CLOSED rather than skipping the file silently.
      problems.push({ path, n: null, problem: `unreadable (${err.code ?? err.message})` })
      continue
    }
    for (const { n, text } of proseLines(path, content)) {
      const found = findClaims(text, caps, ctxRe)
      if (found.length === 0) continue
      const waiver = parseWaiver(text)
      if (waiver?.problem) {
        problems.push({ path, n, problem: waiver.problem })
        continue
      }
      if (waiver) continue
      const seenKey = `${path}\u0000${text.trim()}`
      const occurrence = seen.get(seenKey) ?? 0
      seen.set(seenKey, occurrence + 1)
      claims.set(claimKey(path, text, occurrence), {
        path,
        n,
        text,
        values: found.map((f) => f.value),
      })
    }
  }
  return { claims, problems }
}

/**
 * Baseline rows that describe no live claim — the line was edited, moved out of the corpus,
 * waived, or deleted. Reported, never auto-applied: a check that rewrites its own baseline
 * can launder any finding into a clean run.
 */
export function staleBaselineEntries(claims, baseline) {
  return Object.keys(baseline ?? {}).filter((key) => !claims.has(key))
}

// ---------------------------------------------------------------- git

function git(args, opts) {
  return execFileSync('git', args, { maxBuffer: MAX_BUFFER, ...opts })
}

function splitNul(buf) {
  return buf
    .toString('utf8')
    .split('\0')
    .filter((s) => s.length > 0)
}

function inCorpus(path) {
  if (path.startsWith(MEMORY_PREFIX)) return false
  if (EXCLUDED_PATHS.has(path)) return false
  return CORPUS.some((root) => (root.endsWith('/') ? path.startsWith(root) : path === root))
}

/**
 * Spec directories whose `tasks.md` has no `- [ ]` left. `agent-workflow.md § Rule-Mirror
 * Sync` already designates such a spec a historical record, so this derives from that rule
 * rather than inventing a second authority.
 *
 * FAIL DIRECTION: a spec whose `tasks.md` cannot be read counts as LIVE. Including it is
 * merely noisy; excluding it silently unwatches a whole tree.
 */
export function completedSpecDirs(files, readFile) {
  const done = []
  for (const path of files) {
    if (!path.startsWith('.spec-workflow/specs/') || !path.endsWith('/tasks.md')) continue
    let content
    try {
      content = readFile(path)
    } catch {
      continue // unreadable reads as LIVE
    }
    if (!content.includes('- [ ]')) done.push(path.slice(0, -'/tasks.md'.length))
  }
  return done
}

/** Tracked corpus paths, minus memory, the run log, and completed specs. */
function corpusFiles(readFile) {
  const tracked = splitNul(git(['ls-files', '-z', '--full-name']))
  const candidates = tracked.filter(inCorpus)
  const completed = completedSpecDirs(candidates, readFile)
  return candidates.filter((p) => !completed.some((dir) => p.startsWith(`${dir}/`)))
}

/**
 * Staged paths, SELF-ENUMERATED.
 *
 * Deliberately NOT lefthook's `{staged_files}`: lefthook filters that list through the
 * command's own `glob:`, so a corpus extension the glob forgets becomes a silent pass — the
 * guard runs, reports clean, and never saw the file. Enumerating here means the corpus
 * definition lives in ONE place, this file.
 *
 * `--name-status -M`, and BOTH paths of an `R` entry are taken: `--name-only` prints only a
 * rename's DESTINATION, so a claim moved OUT of a graded path would drop out of scope.
 */
export function stagedPaths(raw) {
  const fields = splitNul(raw)
  const out = []
  for (let i = 0; i < fields.length; ) {
    const status = fields[i]
    if (!/^[A-Z]\d*$/.test(status)) {
      // A desync shifts every later path by one and the guard then scopes the WRONG files
      // at exit 0. Abort rather than resynchronise on a guess.
      throw new Error(`unrecognised --name-status record ${JSON.stringify(status)}`)
    }
    const count = status[0] === 'R' || status[0] === 'C' ? 2 : 1
    for (let k = 1; k <= count; k += 1) out.push(fields[i + k])
    i += 1 + count
  }
  return out
}

/**
 * Read a path's INDEX content by its exact BYTES — the same `cat-file --batch` stdin trick
 * `check-file-size-guard.mjs` uses, and for the same reason: argv is strings, so a path
 * holding a byte that does not decode would be re-encoded to something that names nothing,
 * and the guard would call a perfectly readable staged file unreadable.
 *
 * `cat-file --batch` exits 0 for a missing object, printing `<spec> missing` instead of a
 * blob header — so the header is CHECKED. Skipping that makes this helper fail OPEN.
 */
function readIndexBlob(path) {
  const out = git(['cat-file', '--batch'], {
    input: Buffer.concat([Buffer.from(':'), Buffer.from(path, 'utf8'), Buffer.from([0x0a])]),
  })
  const nl = out.indexOf(0x0a)
  const header = nl === -1 ? out.toString('utf8') : out.subarray(0, nl).toString('utf8')
  const blob = header.match(/ blob (\d+)$/)
  if (!blob) throw new Error(`git cat-file could not resolve the staged path: ${header}`)
  return out.subarray(nl + 1, nl + 1 + Number(blob[1])).toString('utf8')
}

// ---------------------------------------------------------------- baseline IO

function readBaseline() {
  let text
  try {
    text = readFileSync(BASELINE_PATH, 'utf8')
  } catch (err) {
    // ENOENT is the only recoverable case, and it fails CLOSED by construction: with no
    // baseline every live claim is a new violation, so the run BLOCKS loudly rather than
    // passing. Any other error (a permission bit, a directory in its place) is exit 2.
    if (err.code === 'ENOENT') return {}
    throw err
  }
  const obj = JSON.parse(text)
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(`${BASELINE_PATH}: top level must be an object`)
  }
  const claims = obj.claims ?? {}
  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new Error(`${BASELINE_PATH}: \`claims\` must be an object`)
  }
  return claims
}

/**
 * `--update-baseline`: rewrite the data file from the live claim set. HUMAN-INVOKED only.
 * The enforcement path never writes it — a guard that can rewrite its own baseline reports
 * clean by construction. Every added row is printed with a `+`, because a row added here is
 * a new prose restatement being grandfathered and needs an argument in the PR.
 */
function updateBaseline(claims, previous) {
  const next = {}
  for (const key of [...claims.keys()].sort()) next[key] = excerpt(claims.get(key).text)

  const added = Object.keys(next).filter((k) => previous[k] === undefined)
  const removed = Object.keys(previous).filter((k) => next[k] === undefined)

  if (added.length === 0 && removed.length === 0) {
    console.error('[prose-claims] baseline already matches the corpus — nothing written.')
    return 0
  }
  for (const k of removed) console.error(`  - ${k}  (was: ${previous[k]})`)
  for (const k of added) console.error(`  + ${k}  ${next[k]}`)

  const body = {
    _: `Prose restatements of a .claude/limits.json cap, grandfathered. SHRINK-ONLY: enforced by ${GUARD}, which never writes this file. Keys are <path>@<sha256-16 of the trimmed claim line>, so a row goes stale the moment its line is edited. Regenerate with \`node ${GUARD} --update-baseline\` and REVIEW THE DIFF — a \`+\` line is a new prose restatement being accepted.`,
    claims: next,
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`)
  console.error(`\n[prose-claims] ${BASELINE_PATH} rewritten. REVIEW THE DIFF before committing —`)
  console.error('  a `+` line grandfathers a cap value restated in prose, which needs an argument.')
  return 0
}

// ---------------------------------------------------------------- main

/**
 * Print the findings and return the exit code. Pure output: it decides nothing.
 *
 * Split out of `main` because that function had grown past the §3 cap doing seven things, and
 * reporting is the one with no control-flow dependency on the rest — the decisions are already
 * made by the time anything here runs. Keeping the three blocks in one function rather than three
 * is deliberate: their ORDER is the message (what is unusable, then what is new, then what no
 * longer matches), and splitting them further would hide that ordering behind call sites.
 */
function reportFindings({ scopedProblems, fresh, stale, baseline }) {
  if (scopedProblems.length > 0) {
    console.error('✖ prose-claims guard: unusable `prose-claim-ok` waiver or unreadable file\n')
    for (const p of scopedProblems) {
      console.error(`  ${p.path}${p.n === null ? '' : `:${p.n}`}  ${p.problem}`)
    }
    console.error('')
  }

  if (fresh.length > 0) {
    console.error(
      `✖ prose-claims guard (code-style.md §1): prose restates a ${LIMITS_PATH} cap value.\n`,
    )
    for (const [, c] of fresh) {
      console.error(`  ${c.path}:${c.n}  restates ${c.values.join(', ')}`)
      console.error(`    ${excerpt(c.text)}`)
    }
    console.error('\n  → point at the data file instead of copying the number, e.g. "the cap in')
    console.error(
      `    ${LIMITS_PATH}" or \`node .claude/hooks/check-file-size-guard.mjs --stats\`.`,
    )
    console.error('  → or, if this prose genuinely must carry the number, mark the line:')
    console.error('      <!-- prose-claim-ok: <why this prose must carry the number> -->')
    console.error('      // prose-claim-ok: <why this prose must carry the number>\n')
  }

  if (stale.length > 0) {
    console.error(`✖ prose-claims guard: ${BASELINE_PATH} rows describe no live claim.\n`)
    for (const key of stale) console.error(`  ${key}  (was: ${baseline[key]})`)
    console.error(`\n  → the claim line changed or went away. Record it:`)
    console.error(`      node ${GUARD} --update-baseline\n`)
  }

  console.error(
    'Searched: CLAUDE.md, .coderabbit.yaml, .claude/**, docs/**, .spec-workflow/** (live specs)',
  )
  console.error(
    `Excluded: ${MEMORY_PREFIX}**, ${[...EXCLUDED_PATHS].join(', ')}, completed specs, code/data lines`,
  )
  return 1
}

export function main(args) {
  const flags = args.filter((a) => a.startsWith('--'))
  const positional = args.filter((a) => !a.startsWith('--'))
  if (positional.length > 0) {
    // This guard SELF-ENUMERATES. Accepting paths would reintroduce exactly the hole the
    // self-enumeration closes — a caller passing a filtered list that omits a corpus file.
    console.error(`✖ prose-claims guard: takes flags only, got ${JSON.stringify(positional[0])}`)
    return 2
  }
  const unknown = flags.filter((f) => !KNOWN_FLAGS.has(f))
  if (unknown.length > 0) {
    console.error(`✖ prose-claims guard: unknown flag(s) ${unknown.join(' ')}`)
    return 2
  }
  // Two modes both clear the unknown-flag gate, then whichever branch is tested first wins
  // and the other request is dropped with no diagnostic at exit 0 — the collision
  // `check-file-size-guard.mjs` documents at its own arg parser. Do not guess a precedence.
  if (new Set(flags).size > 1) {
    console.error(`✖ prose-claims guard: ${[...new Set(flags)].join(' and ')} are separate modes`)
    return 2
  }

  const limits = JSON.parse(readFileSync(LIMITS_PATH, 'utf8'))
  const staged = !flags.includes('--all') && !flags.includes('--update-baseline')
  const read = (path) => (staged ? readIndexBlob(path) : readFileSync(path, 'utf8'))

  const files = corpusFiles(read)
  const { claims, problems } = evaluate(files, read, limits)

  if (flags.includes('--update-baseline')) {
    if (problems.length > 0) {
      // Writing a baseline from a partial read would record the corpus as smaller than it
      // is, and every claim in the unread file would then be invisible forever.
      console.error('✖ prose-claims guard: cannot rewrite the baseline from an incomplete read')
      for (const p of problems) console.error(`  ${p.path}: ${p.problem}`)
      return 2
    }
    return updateBaseline(claims, readBaseline())
  }

  const baseline = readBaseline()
  const stale = staleBaselineEntries(claims, baseline)

  // BLOCKING SCOPE. A commit is not failed by a prose claim in a file it did not touch —
  // otherwise the guard's introduction blocks every commit in the repo until the whole
  // corpus is clean. Stale rows are NOT scoped: they are a property of the data file, and
  // the whole point of a shrink-only ratchet is that a shrink must be RECORDED.
  const scope = staged
    ? new Set(stagedPaths(git(['diff', '--cached', '--name-status', '-z', '-M'])))
    : null
  const inScope = (path) => scope === null || scope.has(path)

  const fresh = [...claims.entries()].filter(
    ([key, c]) => baseline[key] === undefined && inScope(c.path),
  )
  const scopedProblems = problems.filter((p) => inScope(p.path))

  if (fresh.length === 0 && stale.length === 0 && scopedProblems.length === 0) return 0

  return reportFindings({ scopedProblems, fresh, stale, baseline })
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`✖ prose-claims guard: check could not run — BLOCKING: ${err.message}`)
    console.error(
      '  This is an environmental failure, NOT a finding. Do NOT write a prose-claim-ok waiver for it.',
    )
    exit(2)
  }
}
