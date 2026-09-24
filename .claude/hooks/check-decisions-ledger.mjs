#!/usr/bin/env node

// Mechanical guard: mechanises Decision 86 — docs/decisions.md holds one line per decision,
// never edited; a later decision adds a new line and marks the old one `Superseded by N.`
// (or `Amended by N.`). Blocks any edit to an EXISTING line other than an appended marker,
// plus any line-format or numbering break in the new file.
//
// Usage:  node .claude/hooks/check-decisions-ledger.mjs <commit-msg-file>   (commit-msg)
//         node .claude/hooks/check-decisions-ledger.mjs --base <ref>        (CI: per commit in <ref>..HEAD, --no-merges, then merge-base..HEAD)
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
// A unit whose NEW is byte-identical to OLD is clean: F1/F2 grade only a commit that touches the file.
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
// Merge commits: commit-msg mode exits 0 while MERGE_HEAD resolves, and --base's per-commit
// units walk --no-merges. --base then runs a RANGE unit: OLD = ledger at
// `git merge-base <ref> HEAD`, NEW = HEAD's. A range finding for token T clears only when HEAD's
// T has the body of the text a waiving per-commit unit produced and every marker of it the
// merge-base also had; a DESCENDANT per-commit unit whose OLD T still matches that text re-binds
// it to its own result, and one re-adding a waived-removed T retires it. A merge never waives, so an edit made only
// in a merge resolution blocks in CI. A non-merge commit HEAD reaches is an ancestor of the
// merge-base or a per-commit unit, so <ref> need not be an ancestor of HEAD. With several merge-bases
// (criss-cross) git picks one, and the range unit can OVER-block. Only lines present at the
// merge-base are protected: a merge dropping a line or marker the branch itself added is the
// PR choosing not to land it.

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

/** F1/F2 (always) plus I1-I3 (only when OLD is present) findings, before waivers are applied. */
function collectFindings(oldText, newLedger) {
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
  if (oldText !== null) findings.push(...checkImmutability(parseLedger(oldText), newLedger))
  return findings
}

/** Drop every finding whose token is waived; a waiver matching nothing surfaces separately. */
function applyWaivers(findings, waivers) {
  const applied = new Set()
  const offenders = []
  for (const f of findings) {
    if (f.token !== null && waivers.has(f.token)) {
      applied.add(f.token)
      continue
    }
    offenders.push(f)
  }
  const unusedWaivers = [...waivers.keys()].filter((t) => !applied.has(t))
  return { offenders, unusedWaivers }
}

/**
 * One unit's worth of work: `oldText`/`newText` are ledger content or `null` (absent),
 * `message` is the commit message whose trailers waive per-token immutability findings.
 * Pure — no git, no fs — so every branch is covered by check-decisions-ledger.test.mjs.
 */
export function checkUnit({ oldText, newText, message }) {
  const { waivers, problems } = parseWaivers(message)
  if (problems.length > 0) return { problems, offenders: [], unusedWaivers: [] }

  if (newText === null) {
    if (oldText === null) return { problems: [], offenders: [], unusedWaivers: [] }
    return {
      problems: [],
      offenders: [{ token: null, kind: 'deleted', detail: 'docs/decisions.md deleted' }],
      unusedWaivers: [],
    }
  }

  if (oldText === newText) return { problems: [], ...applyWaivers([], waivers) }

  const findings = collectFindings(oldText, parseLedger(newText))
  return { problems: [], ...applyWaivers(findings, waivers) }
}

/** The text a waiver for `token` authorizes: the header, entry N's raw line, or `null` (absent). */
export function slotText(text, token) {
  if (text === null) return null
  const ledger = parseLedger(text)
  if (token === 'header') return ledger.header
  const hit = parsedEntries(ledger.entries).find((e) => String(e.num) === token)
  return hit ? hit.raw : null
}

/** A slot's comparable form: the header text, entry N's body + marker set, or `null` (absent). */
function partsOf(raw, token) {
  if (raw === null || token === 'header') return { body: raw, markers: new Set() }
  return splitMarkers(raw)
}

function slotParts(text, token) {
  return partsOf(slotText(text, token), token)
}

/** HEAD's slot for `token` is what `authorizedText` authorized: same body, markers ⊇. */
function slotMatches(authorizedText, headText, token) {
  const auth = partsOf(authorizedText, token)
  const head = slotParts(headText, token)
  if (auth.body !== head.body) return false
  return [...auth.markers].every((mk) => head.markers.has(mk))
}

/** The range finding for `token` is cleared by `authorizedText`: HEAD has its body and every
 *  marker of it the merge-base also had (a marker the branch added may be left out). */
function rangeCleared(authorizedText, { oldText, newText, token }) {
  const auth = partsOf(authorizedText, token)
  const head = slotParts(newText, token)
  const base = slotParts(oldText, token).markers
  if (head.body !== auth.body) return false
  return [...auth.markers].every((mk) => !base.has(mk) || head.markers.has(mk))
}

/**
 * The range unit: `oldText` at the merge-base, `newText` at HEAD, `authorized` a
 * Map<token, text[]> of the still-live waived texts per token. `gradeFormat` false skips F1/F2
 * when a per-commit unit already graded this exact HEAD text. Pure.
 */
export function checkRange({ oldText, newText, authorized, gradeFormat }) {
  if (oldText === newText) return []
  if (newText === null) {
    return [{ token: null, kind: 'deleted', detail: 'docs/decisions.md deleted' }]
  }
  const findings = collectFindings(oldText, parseLedger(newText)).filter(
    (f) => gradeFormat || (f.kind !== 'format' && f.kind !== 'numbering'),
  )
  const isCleared = (f) =>
    (authorized.get(f.token) ?? []).some((t) =>
      rangeCleared(t, { oldText, newText, token: f.token }),
    )
  return findings.filter((f) => f.token === null || !isCleared(f))
}

// ---------------------------------------------------------------- git-facing reads

/** `true` on exit 0, `false` on exit 1, throws on anything else (a fault, never "no"). */
function gitProbe(args) {
  try {
    git(args)
    return true
  } catch (err) {
    if (err.status === 1 && !err.signal) return false
    throw err
  }
}

function refExists(ref) {
  return gitProbe(['rev-parse', '--verify', '--quiet', ref])
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

/** The remedy for a finding on `token`. A range finding names redoing a merge only when a merge
 *  wrote the line (`merge`); its edit is otherwise a non-merge commit's to waive. */
function hintFor(token, { label, merge }) {
  if (label !== 'range') {
    return `add to the commit message: Ledger-edit-ok: ${token} — <why this edit is safe>`
  }
  if (!merge) {
    return `add Ledger-edit-ok: ${token} to the non-merge commit that made the edit`
  }
  return `a merge cannot waive: restore this line in a commit with Ledger-edit-ok: ${token}, or redo the merge without the edit and make it in a non-merge commit with Ledger-edit-ok: ${token}`
}

function reportUnit(label, offenders, { unusedWaivers = [], mergeWrote = () => false } = {}) {
  if (offenders.length > 0) {
    console.error(
      `✖ decisions-ledger guard (Decision 86): docs/decisions.md was edited outside the allowed shape${label ? ` [${label}]` : ''}\n`,
    )
    for (const o of offenders) {
      console.error(`  ${o.detail}`)
      if (o.token !== null)
        console.error(`    → ${hintFor(o.token, { label, merge: mergeWrote(o.token) })}`)
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

/** Per-commit units, parents first; --no-merges (see header). */
function baseUnits(ref) {
  const shas = git(['rev-list', '--reverse', '--topo-order', '--no-merges', `${ref}..HEAD`])
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

/** The single commit-msg-mode unit: staged INDEX vs HEAD, waived by the message file itself. */
function commitMsgUnit(path) {
  return {
    oldText: readAtTree('HEAD', DECISIONS_PATH),
    newText: readIndex(DECISIONS_PATH),
    message: readFileSync(path, 'utf8'),
    label: null,
  }
}

function isAncestor(a, b) {
  return gitProbe(['merge-base', '--is-ancestor', a, b])
}

/** Re-bind to `unit`'s result each ancestor authorization that `unit`'s OLD slot still matches
 *  (so text a merge wrote is never adopted); a removal authorization is retired, never re-bound,
 *  when `unit` re-adds the line. Then add `unit`'s own applied waivers.
 *  `live` is Map<token, {sha, text}[]>. */
function recordAuthorizations(live, unit, unusedWaivers) {
  for (const [token, list] of live) {
    const text = slotText(unit.newText, token)
    const follows = (a) => slotMatches(a.text, unit.oldText, token) && isAncestor(a.sha, unit.label)
    const rebind = (a) => {
      if (!follows(a)) return [a]
      if (a.text === null && text !== null) return []
      return [{ ...a, text }]
    }
    live.set(token, list.flatMap(rebind))
  }
  // No ledger in NEW: checkUnit returned before applying waivers, so none was applied.
  if (unit.newText === null) return
  // A re-add raises no per-commit finding (OLD lacks the line), yet its waiver authorizes the text.
  const readds = (token) =>
    slotText(unit.oldText, token) === null && slotText(unit.newText, token) !== null
  for (const token of parseWaivers(unit.message).waivers.keys()) {
    if (unusedWaivers.includes(token) && !readds(token)) continue
    live.set(token, [
      ...(live.get(token) ?? []),
      { sha: unit.label, text: slotText(unit.newText, token) },
    ])
  }
}

/** Per-commit units, recording each applied waiver's resulting text, then the range unit. */
function runBase(ref) {
  const live = new Map()
  let blocked = false
  let lastTouched
  const reported = new Set()
  for (const unit of baseUnits(ref)) {
    const res = checkUnit(unit)
    if (res.problems.length > 0) return reportProblems(res.problems)
    if (res.offenders.length > 0) blocked = true
    reportUnit(unit.label, res.offenders, { unusedWaivers: res.unusedWaivers })
    for (const o of res.offenders)
      for (const k of reportedKeys(o, unit.oldText, unit.newText)) reported.add(k)
    recordAuthorizations(live, unit, res.unusedWaivers)
    if (unit.oldText !== unit.newText) lastTouched = unit.newText
  }
  if (runRange(ref, live, { lastTouched, reported })) blocked = true
  return blocked ? 1 : 0
}

/** The blame-walk KEY for `offender` at ledger text `text`: what must stay equal while walking
 *  parents to find who wrote it. Kind `body`/`missing`/`header` track the entry's (or header's)
 *  body with markers stripped, so a marker append never moves the writer. Kind `marker` tracks
 *  the sorted, still-present subset of `baseText`'s markers for the token, so a later append of
 *  a DIFFERENT marker doesn't move the writer either, and a merge that dropped the marker is found. */
function offenderKey({ kind, token }, baseText) {
  if (kind !== 'marker') return (text) => slotParts(text, token).body
  const baseMarkers = [...slotParts(baseText, token).markers].sort()
  return (text) => baseMarkers.filter((mk) => slotParts(text, token).markers.has(mk)).join('\n')
}

/** `fn` memoized on its argument list. */
function memoize(fn) {
  const cache = new Map()
  return (...args) => {
    const k = args.join(' ')
    if (!cache.has(k)) cache.set(k, fn(...args))
    return cache.get(k)
  }
}

/** A merge-blame walker bound to `baseText`, shared across every offender in one range run:
 *  ledger text, parent and merge-base lookups are memoized once, not per offender. Each call
 *  follows the first parent whose key matches HEAD's. A merge whose other parent `q` changed
 *  the key from the two parents' merge-base discarded that change, so the merge wrote the line.
 *  Otherwise the commit where no parent matches wrote it; `true` only when that is a merge. */
function buildMergeWalker(baseText) {
  const ledgerAt = memoize((sha) => readAtTree(sha, DECISIONS_PATH))
  const parentsOf = memoize((sha) =>
    git(['rev-list', '--parents', '-n', '1', sha]).toString('utf8').trim().split(' ').slice(1),
  )
  const mergeBaseOf = memoize((a, b) =>
    gitProbe(['merge-base', a, b]) ? git(['merge-base', a, b]).toString('utf8').trim() : null,
  )
  return (offender) => {
    const key = offenderKey(offender, baseText)
    const keyAt = (sha) => key(ledgerAt(sha))
    const target = keyAt('HEAD')
    const discarded = (p, q) => {
      const mb = mergeBaseOf(p, q)
      return mb !== null && keyAt(q) !== keyAt(mb)
    }
    let c = 'HEAD'
    for (;;) {
      const ps = parentsOf(c)
      const p = ps.find((par) => keyAt(par) === target)
      if (p === undefined) return ps.length > 1
      if (ps.some((q) => q !== p && discarded(p, q))) return true
      c = p
    }
  }
}

/** A `mergeWrote(token)` predicate for `offenders`, built lazily — a clean run (none) makes no
 *  extra git call. */
function mergeWroteFor(offenders, baseText) {
  if (offenders.length === 0) return () => false
  const walk = buildMergeWalker(baseText)
  const byToken = new Map(offenders.map((o) => [o.token, o]))
  return (token) => byToken.has(token) && walk(byToken.get(token))
}

/** The `reported` dedup keys for a finding: one per lost marker for kind `marker` (so a later
 *  append of a different marker, or a second drop, doesn't un-dedup it); otherwise one, over the
 *  body alone for kind `body` (a later marker append doesn't un-dedup it) or the raw slot text. */
function reportedKeys({ token, kind }, oldText, newText) {
  if (kind === 'marker') {
    const kept = slotParts(newText, token).markers
    return [...slotParts(oldText, token).markers]
      .filter((mk) => !kept.has(mk))
      .map((mk) => `${token}\nmarker\n${mk}`)
  }
  const k = kind === 'body' ? slotParts(newText, token).body : slotText(newText, token)
  return [`${token}\n${kind}\n${k}`]
}

/** The range unit over merge-base..HEAD; reports and returns whether it found offenders. */
function runRange(ref, live, { lastTouched, reported }) {
  const mergeBase = git(['merge-base', ref, 'HEAD']).toString('utf8').trim()
  const oldText = readAtTree(mergeBase, DECISIONS_PATH)
  const newText = readAtTree('HEAD', DECISIONS_PATH)
  const authorized = new Map([...live].map(([t, list]) => [t, list.map((a) => a.text)]))
  const offenders = checkRange({
    oldText,
    newText,
    authorized,
    gradeFormat: newText !== lastTouched,
  })
  // A finding every part of which a per-commit unit already reported has its fix there; skip it.
  const wasReported = (o) => {
    const keys = reportedKeys(o, oldText, newText)
    return keys.length > 0 && keys.every((k) => reported.has(k))
  }
  const filtered = offenders.filter((o) => o.token === null || !wasReported(o))
  reportUnit('range', filtered, { mergeWrote: mergeWroteFor(filtered, oldText) })
  return offenders.length > 0
}

function runUnits(units) {
  let blocked = false
  for (const unit of units) {
    const res = checkUnit(unit)
    if (res.problems.length > 0) return reportProblems(res.problems)
    if (res.offenders.length > 0) blocked = true
    reportUnit(unit.label, res.offenders, { unusedWaivers: res.unusedWaivers })
  }
  return blocked ? 1 : 0
}

export function main(args) {
  if (args[0] === '--base') {
    if (!args[1]) {
      console.error('✖ decisions-ledger guard: --base requires a ref')
      return 2
    }
    return runBase(args[1])
  } else if (args.length === 1 && !args[0].startsWith('--')) {
    if (refExists('MERGE_HEAD')) return 0
    return runUnits([commitMsgUnit(args[0])])
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
