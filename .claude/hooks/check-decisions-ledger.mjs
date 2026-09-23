#!/usr/bin/env node

// Mechanical guard: mechanises Decision 86 — docs/decisions.md holds one line per decision,
// never edited; a later decision adds a new line and marks the old one `Superseded by N.`
// (or `Amended by N.`). Blocks any edit to an EXISTING line other than an appended marker,
// plus any line-format or numbering break in the new file.
//
// Usage:  node .claude/hooks/check-decisions-ledger.mjs <commit-msg-file>   (commit-msg)
//         node .claude/hooks/check-decisions-ledger.mjs --base <ref>        (CI, <ref>...HEAD)
// Exit:   0 = docs/decisions.md was not edited outside the allowed shape
//         1 = at least one finding — fix it, or waive it (see below)
//         2 = the check COULD NOT RUN (usage, git failure, unreadable message file)
//
// Checks, mirroring check-retracted-phrase.mjs's two-mode shape:
//   F1 every entry line matches `## <N> — <YYYY-MM-DD> — <text>`             — never waivable
//   F2 entry numbers strictly consecutive (each = previous + 1)              — never waivable
//   I1 every OLD entry number still exists in NEW                           — waivable per number
//   I2 an OLD entry's body is byte-identical in NEW, and NEW's trailing      — waivable per number
//      `Superseded by N.`/`Amended by N.` markers are a SUPERSET of OLD's
//   I3 the header (everything before the first `## ` line) is unchanged      — waivable as `header`
// NEW absent while OLD present is a whole-file deletion — always a finding, never waivable.
// Both absent (path never existed) is a clean run: nothing to check.
//
// Escape hatch, one per token: a commit-message trailer
//     Ledger-edit-ok: <N|header> — <reason>
// naming ONE token (a decision number, or the literal `header`), carrying a written reason
// (same shape as check-retracted-phrase's `Retracted-ok:` — see TRAILER_RE/EMPTY_REASONS
// below). A waiver naming a token no finding needs is reported, not an error.
//
// Absent-vs-fault: `git ls-tree`/`git ls-files --stage` decide presence — empty stdout is
// ABSENT, a non-zero exit is a FAULT and propagates to exit 2. `git cat-file -e` is never used
// here: it exits 128 for both, so a probe built on it fails open (reference-git-probe-absent-vs-fault).
//
// `Ledger-edit-ok:` is read only from a message's last paragraph, column 0, comments dropped,
// message truncated at a `git commit -v` scissors line first (see trailerBlock). Under
// `git commit --amend`, commit-msg mode's HEAD is the commit being amended — an edit already
// there reads as unchanged; waive it the same way.
//
// commit-msg mode during a merge (MERGE_HEAD present): a finding blocks only if it holds
// against BOTH HEAD and MERGE_HEAD — an edit already accepted on the incoming side passes.
//
// --base mode's range unit (catches an edit only a merge commit's own tree carries) is waived
// by (a) waivers a per-commit unit actually APPLIED to a real finding, plus (b) a merge
// commit's own trailer — never by an unused per-commit waiver (see runBaseMode).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MAX_BUFFER = 64 * 1024 * 1024
const DECISIONS_PATH = 'docs/decisions.md'

const ENTRY_RE = /^## (\d+) — (\d{4}-\d{2}-\d{2}) — (.+)$/

// Anchored to the END of the line, deliberately: Decision 86's own text contains the phrase
// "Superseded by N (or Amended by N)" MID-SENTENCE, followed by more prose — this pattern
// requires the marker sentence to be the line's last characters, so it never matches there.
const MARKER_ONE_RE = / (Superseded|Amended) by (\d+(?:, \d+)*)\.$/

const TRAILER_RE = /^Ledger-edit-ok:\s*(\S+)\s*[—:-]\s*(.+?)\s*$/

// `git commit -v` / core.commentChar default: everything from this line on is the diff git
// appended for editing convenience, never part of the message.
const SCISSORS_RE = /^\S -{24} >8 -{24}$/

/** Reasons that assert nothing. Copied from check-retracted-phrase.mjs's EMPTY_REASONS. */
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

function git(args, input) {
  return execFileSync('git', args, { maxBuffer: MAX_BUFFER, input })
}

// ---------------------------------------------------------------- pure: parsing

/**
 * Strip trailing `Superseded by N.`/`Amended by N.` marker sentences off a line, one at a
 * time (so `Superseded by 30. Amended by 40.` yields two markers). Returns the remaining
 * body and the set of `<Kind> <N>` pairs found — one pair per number in a comma list, since
 * `Amended by 20, 82.` names two decisions amending this one.
 */
export function splitMarkers(line) {
  let body = line
  const markers = new Set()
  let m = MARKER_ONE_RE.exec(body)
  while (m) {
    const kind = m[1]
    for (const n of m[2].split(',').map((s) => s.trim())) markers.add(`${kind} ${n}`)
    body = body.slice(0, m.index)
    m = MARKER_ONE_RE.exec(body)
  }
  return { body, markers }
}

/**
 * Split ledger text into the header (every line before the first `## ` line) and the entry
 * lines (every later non-blank line, in order, as raw strings — format validation is a
 * separate step so a malformed line can still be reported rather than silently dropped).
 */
export function parseLedger(text) {
  // No trailing-newline pop: `text.split('\n')` turns a file's final `\n` into one trailing
  // '' element, and the blank-line skip in the entries loop below already discards it —
  // a second guard for the same case would be dead code, never reachable differently.
  const rawLines = text.split('\n')
  let i = 0
  const headerLines = []
  while (i < rawLines.length && !rawLines[i].startsWith('## ')) {
    headerLines.push(rawLines[i])
    i++
  }
  const entries = []
  for (; i < rawLines.length; i++) {
    if (rawLines[i].trim() === '') continue
    entries.push(rawLines[i])
  }
  return { header: headerLines.join('\n'), entries }
}

/** Entry lines that do not match `## <N> — <date> — <text>`. F1 — never waivable. */
export function checkFormat(entries) {
  return entries.filter((raw) => !ENTRY_RE.test(raw))
}

/** Parsed `{num, raw}` for every entry that DOES match ENTRY_RE, in file order. */
function parsedEntries(entries) {
  const out = []
  for (const raw of entries) {
    const m = ENTRY_RE.exec(raw)
    if (m) out.push({ num: Number(m[1]), raw })
  }
  return out
}

/**
 * Non-consecutive numbers among the entries that DID parse (a malformed line is F1's
 * business, not F2's). F2 — never waivable.
 */
export function checkNumbering(entries) {
  const parsed = parsedEntries(entries)
  const offenders = []
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].num !== parsed[i - 1].num + 1) {
      offenders.push(
        `## ${parsed[i].num} follows ## ${parsed[i - 1].num}, expected ## ${parsed[i - 1].num + 1}`,
      )
    }
  }
  return offenders
}

/** One OLD entry vs its NEW counterpart (or absence) — `null` when nothing changed. */
function checkEntry(num, oldRaw, newRaw) {
  const token = String(num)
  if (newRaw === undefined) {
    return { token, kind: 'missing', detail: `## ${num} — line removed entirely` }
  }
  const oldSplit = splitMarkers(oldRaw)
  const newSplit = splitMarkers(newRaw)
  if (oldSplit.body !== newSplit.body) {
    return {
      token,
      kind: 'body',
      detail: `## ${num} — body edited (only an appended marker is allowed)`,
    }
  }
  const droppedMarkers = [...oldSplit.markers].filter((mk) => !newSplit.markers.has(mk))
  if (droppedMarkers.length > 0) {
    return {
      token,
      kind: 'marker',
      detail: `## ${num} — lost marker(s): ${droppedMarkers.join(', ')}`,
    }
  }
  return null
}

/**
 * I1/I2/I3: OLD entries must all survive in NEW, unedited except for an appended marker; the
 * header must be unchanged. Returns `{token, kind, detail}` findings — `token` is a decision
 * number (as a string) or `'header'`, matching what a `Ledger-edit-ok:` trailer names.
 */
export function checkImmutability(oldLedger, newLedger) {
  const offenders = []
  if (oldLedger.header !== newLedger.header) {
    offenders.push({ token: 'header', kind: 'header', detail: 'docs/decisions.md header changed' })
  }
  const newByNum = new Map()
  for (const { num, raw } of parsedEntries(newLedger.entries)) newByNum.set(num, raw)

  for (const { num, raw: oldRaw } of parsedEntries(oldLedger.entries)) {
    const finding = checkEntry(num, oldRaw, newByNum.get(num))
    if (finding) offenders.push(finding)
  }
  return offenders
}

/** A message's trailer paragraph: truncated at a `-v` scissors line, `#`-comments dropped,
 *  then lines after the last blank line. */
function trailerBlock(message) {
  const lines = message.split('\n')
  const cut = lines.findIndex((line) => SCISSORS_RE.test(line))
  const scoped = cut === -1 ? lines : lines.slice(0, cut)
  const raw = scoped.filter((line) => !line.startsWith('#'))
  while (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()
  let lastBlank = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].trim() === '') lastBlank = i
  }
  return raw.slice(lastBlank + 1)
}

/** `Ledger-edit-ok:` trailers in `trailerBlock(message)`. An unusable waiver is an ERROR. */
export function parseWaivers(message) {
  const waivers = new Map()
  const problems = []
  for (const line of trailerBlock(message)) {
    const m = TRAILER_RE.exec(line)
    if (!m) continue
    const [, token, reason] = m
    const bare = reason
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .trim()
    if (reason.replace(/\s/g, '').length < 20 || EMPTY_REASONS.has(bare)) {
      problems.push(
        `Ledger-edit-ok(${token}): the reason must state why this edit is safe (>= 20 chars, not a bare "${reason}")`,
      )
      continue
    }
    waivers.set(token, reason)
  }
  return { waivers, problems }
}

/**
 * F1/F2 (always) plus I1-I3 vs `oldText` (when present). `oldTextAlt`, when given, is a
 * SECOND old version (MERGE_HEAD) — an I1-I3 finding is kept only if it ALSO holds against
 * `oldTextAlt`, so an edit already accepted on either side of a merge passes.
 */
function collectFindings(oldText, newLedger, oldTextAlt) {
  const findings = [
    ...checkFormat(newLedger.entries).map((raw) => ({
      token: null,
      kind: 'format',
      detail: `malformed entry line: ${raw}`,
    })),
    ...checkNumbering(newLedger.entries).map((detail) => ({
      token: null,
      kind: 'numbering',
      detail,
    })),
  ]
  if (oldText === null) return findings
  const primary = checkImmutability(parseLedger(oldText), newLedger)
  if (oldTextAlt == null) return [...findings, ...primary]
  const altTokens = new Set(
    checkImmutability(parseLedger(oldTextAlt), newLedger).map((o) => o.token),
  )
  return [...findings, ...primary.filter((o) => altTokens.has(o.token))]
}

/** Drop every finding whose token is waived; a waiver matching nothing surfaces separately.
 *  `applied` is the waivers that actually cleared a finding — never the full waiver set. */
function applyWaivers(findings, waivers) {
  const applied = new Map()
  const offenders = []
  for (const f of findings) {
    if (f.token !== null && waivers.has(f.token)) {
      applied.set(f.token, waivers.get(f.token))
      continue
    }
    offenders.push(f)
  }
  const unusedWaivers = [...waivers.keys()].filter((t) => !applied.has(t))
  return { offenders, unusedWaivers, applied }
}

/**
 * One unit's worth of work: `oldText`/`newText` are ledger content or `null` (absent),
 * `message` is the commit message whose trailers waive per-token immutability findings — or
 * pass a prebuilt `waivers` Map to skip parsing `message` (the range unit's own pool).
 * Pure — no git, no fs — so every branch is covered by check-decisions-ledger.test.mjs.
 */
export function checkUnit({ oldText, newText, message, waivers: prebuilt, oldTextAlt }) {
  const { waivers, problems } = prebuilt
    ? { waivers: prebuilt, problems: [] }
    : parseWaivers(message)
  if (problems.length > 0) return { problems, offenders: [], unusedWaivers: [], applied: new Map() }

  if (newText === null) {
    if (oldText === null)
      return { problems: [], offenders: [], unusedWaivers: [], applied: new Map() }
    return {
      problems: [],
      offenders: [{ token: null, kind: 'deleted', detail: 'docs/decisions.md deleted' }],
      unusedWaivers: [],
      applied: new Map(),
    }
  }

  const findings = collectFindings(oldText, parseLedger(newText), oldTextAlt)
  return { problems: [], ...applyWaivers(findings, waivers) }
}

// ---------------------------------------------------------------- git-facing reads

function refExists(ref) {
  try {
    git(['rev-parse', '--verify', '--quiet', ref])
    return true
  } catch (err) {
    if (err.status === 1 && !err.signal) return false
    throw err
  }
}

/** `path` at tree-ish `ref`, or `null` when `ref` doesn't resolve (unborn HEAD, no parent on
 *  a root commit) or `path` is not in that tree. A git error propagates — never read as absent. */
function readAtTree(ref, path) {
  if (!refExists(ref)) return null
  const listing = git(['ls-tree', ref, '--', path]).toString('utf8')
  if (listing.trim() === '') return null
  return git(['show', `${ref}:${path}`]).toString('utf8')
}

/** `path` in the INDEX, or `null` when it is not staged there. */
function readIndex(path) {
  const listing = git(['ls-files', '--stage', '--', path]).toString('utf8')
  if (listing.trim() === '') return null
  return git(['show', `:${path}`]).toString('utf8')
}

// ---------------------------------------------------------------- reporting

function reportUnit(label, offenders, unusedWaivers) {
  if (offenders.length > 0) {
    console.error(
      `✖ decisions-ledger guard (Decision 86): docs/decisions.md was edited outside the allowed shape${label ? ` [${label}]` : ''}\n`,
    )
    for (const o of offenders) {
      console.error(`  ${o.detail}`)
      if (o.token !== null) {
        console.error(
          `    → add to the commit message: Ledger-edit-ok: ${o.token} — <why this edit is safe>`,
        )
      }
    }
  }
  if (unusedWaivers.length > 0) {
    console.error(
      `  (note) Ledger-edit-ok waiver(s) matched no finding${label ? ` [${label}]` : ''}: ${unusedWaivers.join(', ')}`,
    )
  }
}

function reportProblems(problems) {
  console.error('✖ decisions-ledger guard: unusable Ledger-edit-ok trailer\n')
  for (const p of problems) console.error(`  ${p}`)
  return 1
}

/** OLD = merge-base(ref, HEAD), NEW = HEAD — catches an edit only a merge commit's own tree
 *  carries. Waivers are the caller's prebuilt pool (see runBaseMode), not this unit's own
 *  message. A failed merge-base throws (exit 2). */
function rangeUnit(ref) {
  const mergeBase = git(['merge-base', ref, 'HEAD']).toString('utf8').trim()
  return {
    oldText: readAtTree(mergeBase, DECISIONS_PATH),
    newText: readAtTree('HEAD', DECISIONS_PATH),
    label: `range ${mergeBase}..HEAD`,
  }
}

/** Every MERGE commit's own trailer block, unioned into one waiver pool. A malformed reason
 *  on any of them surfaces as `problems`, same as a per-commit unit's own. */
function mergeOwnWaivers(ref) {
  const shas = git(['rev-list', '--reverse', '--merges', `${ref}..HEAD`])
    .toString('latin1')
    .split('\n')
    .filter(Boolean)
  const pool = new Map()
  const problems = []
  for (const sha of shas) {
    const parsed = parseWaivers(git(['log', '-1', '--format=%B', sha]).toString('utf8'))
    problems.push(...parsed.problems)
    for (const [token, reason] of parsed.waivers) pool.set(token, reason)
  }
  return { pool, problems }
}

/** Per-commit units (--no-merges — a merge commit's OWN trailer is read separately, by
 *  mergeOwnWaivers, and scoped to the range unit only). */
function baseUnits(ref) {
  const shas = git(['rev-list', '--reverse', '--no-merges', `${ref}..HEAD`])
    .toString('latin1')
    .split('\n')
    .filter(Boolean)
  return shas.map((sha) => ({
    oldText: readAtTree(`${sha}^`, DECISIONS_PATH),
    newText: readAtTree(sha, DECISIONS_PATH),
    message: git(['log', '-1', '--format=%B', sha]).toString('utf8'),
    label: sha,
  }))
}

/** The single commit-msg-mode unit: staged INDEX vs HEAD, waived by the message file itself.
 *  Mid-merge (MERGE_HEAD resolves), a finding is also checked against MERGE_HEAD (§ header). */
function commitMsgUnit(path) {
  const merging = refExists('MERGE_HEAD')
  return {
    oldText: readAtTree('HEAD', DECISIONS_PATH),
    oldTextAlt: merging ? readAtTree('MERGE_HEAD', DECISIONS_PATH) : undefined,
    newText: readIndex(DECISIONS_PATH),
    message: readFileSync(path, 'utf8'),
    label: null,
  }
}

/** Run every unit, reporting each; collect the waivers each unit actually APPLIED (never an
 *  unused one) into `pool`, for a caller building a wider unit's waiver pool from them. */
function runUnits(units) {
  let blocked = false
  const pool = new Map()
  for (const unit of units) {
    const res = checkUnit(unit)
    if (res.problems.length > 0) return { code: reportProblems(res.problems), pool, stopped: true }
    if (res.offenders.length > 0) blocked = true
    reportUnit(unit.label, res.offenders, res.unusedWaivers)
    for (const [token, reason] of res.applied) pool.set(token, reason)
  }
  return { code: blocked ? 1 : 0, pool, stopped: false }
}

/** --base mode: per-commit units first; the range unit's pool = per-commit APPLIED waivers
 *  union each merge commit's OWN trailer — never an unused per-commit waiver (§ header). */
function runBaseMode(ref) {
  const perCommit = runUnits(baseUnits(ref))
  if (perCommit.stopped) return perCommit.code
  const merge = mergeOwnWaivers(ref)
  if (merge.problems.length > 0) return reportProblems(merge.problems)
  const pool = new Map([...perCommit.pool, ...merge.pool])
  const range = rangeUnit(ref)
  const res = checkUnit({ ...range, waivers: pool })
  if (res.problems.length > 0) return reportProblems(res.problems)
  reportUnit(range.label, res.offenders, res.unusedWaivers)
  return perCommit.code === 1 || res.offenders.length > 0 ? 1 : 0
}

export function main(args) {
  if (args[0] === '--base') {
    if (!args[1]) {
      console.error('✖ decisions-ledger guard: --base requires a ref')
      return 2
    }
    return runBaseMode(args[1])
  } else if (args.length === 1 && !args[0].startsWith('--')) {
    return runUnits([commitMsgUnit(args[0])]).code
  } else {
    console.error('✖ decisions-ledger guard: usage: <commit-msg-file> | --base <ref>')
    return 2
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`✖ decisions-ledger guard: check could not run — BLOCKING: ${err.message}`)
    exit(2)
  }
}
