#!/usr/bin/env node

// Mechanical guard: block a commit that CORRECTS a claim in one file while the SAME
// claim still stands in another. Mechanises `code-style.md` §10 clause 3 — "a partial
// comment edit is the tell ... grep the retracted phrase repo-wide" — which is the one
// step in that clause nobody performs reliably. Learner row "Claim-correction commit
// updates a count but leaves its arithmetic stale" reached RULE CANDIDATE across five
// separate branches before this guard existed; derive its current count from
// `.claude/agent-memory/learner/MEMORY.md` rather than trusting a number here.
//
// Motivating instance: `3752c88a` corrected packages/db/src/types.ts's line count from
// 1807 to 1806 in `.claude/limits.json` and left "a 1807-line GENERATED file" standing
// in `.claude/hooks/check-file-size-guard.test.mjs`. One reviewer round, one follow-up
// commit, for what is a two-line grep.
//
// Usage:  node .claude/hooks/check-retracted-phrase.mjs <commit-msg-file>   (commit-msg)
//         node .claude/hooks/check-retracted-phrase.mjs --base <ref>        (CI, <ref>...HEAD)
// Exit:   0 = no retracted phrase survives elsewhere
//         1 = at least one survives — finish the correction, or waive it (see below)
//         2 = the check COULD NOT RUN (usage, git failure, parse abort)
//
// Why 1 and 2 are separate, when both fail closed and the gate cannot tell them apart:
// this is the only guard in the repo that ships a suppression mechanism. If "could not
// run" and "you wrote a bad claim" shared exit 1, the cheapest way out of a BROKEN GIT
// INVOCATION would be to write a permanent waiver — masking the breakage forever while
// the guard reports green having checked nothing. Exit 2 makes the waiver structurally
// unavailable as a remedy, and its message says so. Do not "unify the exit codes".
//
// Escape hatch, and there is exactly ONE: a commit-message trailer
//     Retracted-ok: <token> — <reason>
// naming ONE token, carrying a written reason. It cannot be an inline marker: a marker
// on the removed line is text the commit is DELETING, so it would have to be read out of
// the pre-image and would leave nothing greppable behind. There is no flag, no env var,
// no ignore file, and no config allowlist. Do not add one "temporarily".
//
// Scope, deliberately narrow. This finds a token whose retraction was INCOMPLETE. Known
// bounds, stated because understating them would be this guard's own defect:
//   - it says nothing about whether the NEW claim is true;
//   - it does not catch a correction that deletes a stale value WITHOUT replacing it, since
//     the hunk gate requires a same-class replacement;
//   - a correction bundled with a RENAME of the same file is caught only when git's
//     similarity heuristic actually pairs the two blobs. Below the rename threshold git
//     reports A+D, the removal and its replacement land in different entries, and the gate
//     sees neither. Rename detection is left ON precisely to narrow this gap, but it is a
//     heuristic and not a guarantee;
//   - it reads the corpus, not application code.
// It reduces the class; it does not close it.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MAX_BUFFER = 64 * 1024 * 1024

/** The empty tree. Diffed against when HEAD does not resolve (a repo's first commit). */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/**
 * The prose corpus — both the edited side and the surviving-occurrence side.
 * Application code is out of scope: this programme is about rule/doc prose, and every
 * app-code hit in the 120-commit calibration was noise.
 */
const CORPUS = ['CLAUDE.md', '.coderabbit.yaml', '.claude/', 'docs/', '.spec-workflow/']

/**
 * Agent memory NARRATES past false claims verbatim — a tracker row quoting "1807" is a
 * record that the claim was wrong, not a live restatement of it. Counting those files
 * both hides real retractions (the quote exonerates the token as "re-added") and invents
 * fake survivors. Excluded from all three sides: edited, re-added, and surviving.
 */
const MEMORY_PREFIX = '.claude/agent-memory/'

/** Longest-first so `.tsx` cannot be partially matched as `.ts`. */
const FILE_EXT = ['tsx', 'jsx', 'mjs', 'cjs', 'yaml', 'json', 'sql', 'yml', 'ts', 'js', 'md', 'sh']

const FILE_RE = new RegExp(
  // No leading word char, dot, @ or hyphen — that kills `v1.2` and the interior segments of a
  // hostname like `www.example.md`, whose `example.md` is preceded by a dot. `/` is deliberately
  // NOT excluded, so `docs/plan.md` reduces to the basename `plan.md`, which is both what a
  // repo-wide grep wants and what the tracked-file comparison can resolve.
  `(?<![\\w.@-])([A-Za-z0-9_][A-Za-z0-9_.-]*\\.(?:${FILE_EXT.join('|')}))(?![\\w-])`,
  'g',
)

// 3-13 digits. The trailing lookahead deliberately ALLOWS `-`, because "1807-line" is the
// flagship's exact shape; it excludes word chars and `.` so `1807abc`, `1.807` and version
// segments do not match. The lookbehind excludes `#`, `$`, `.`, `-` and word chars, which
// kills `#832`, `v1807` and `2.1807`.
const NUM_RE = /(?<![0-9A-Za-z_$#.-])(\d{3,13})(?![0-9A-Za-z_.])/g

// A number introduced by any of these is a REFERENCE to a ticket, not a claim about the
// world. Calibration: bare issue numbers were the single largest noise class.
const ISSUE_PREFIX_RE = /(?:#|PR\s*#?|issues?\s+#?|pull\/|issues?\/|GH-|mig(?:ration)?\s+)\s*$/i

const TRAILER_RE = /^Retracted-ok:\s*(\S+)\s*[—:-]\s*(.+?)\s*$/

/** Reasons that assert nothing. A waiver must say WHY the survivor is not the same claim. */
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

/**
 * Run git, returning stdout as a Buffer. NEVER returns a falsy value on failure — a
 * `catch` that returns '' turns any git breakage into "nothing was removed" and the guard
 * exits 0 having checked nothing. Callers that can legitimately recover (only `git grep`
 * exit 1) must catch explicitly.
 */
function git(args, input) {
  return execFileSync('git', args, { maxBuffer: MAX_BUFFER, input })
}

/** Split git's NUL-delimited output. Kept as latin1: a lossless 1:1 byte<->char mapping,
 *  so `Buffer.from(k, 'latin1')` recovers the exact original bytes. utf8 is NOT usable —
 *  it decodes an invalid byte to U+FFFD and the path then names nothing. */
function splitNul(buf) {
  return buf
    .toString('latin1')
    .split('\0')
    .filter((s) => s.length > 0)
}

function inCorpus(path) {
  if (path.startsWith(MEMORY_PREFIX)) return false
  return CORPUS.some((root) => (root.endsWith('/') ? path.startsWith(root) : path === root))
}

/**
 * A spec whose tasks are all `[x]` is a historical record, not a live mirror —
 * `agent-workflow.md § Rule-Mirror Sync` already draws exactly this line, so this derives
 * from that rule rather than inventing a second authority.
 *
 * FAIL DIRECTION: a spec with no readable tasks.md counts as LIVE. Including it is merely
 * noisy; excluding it silently unwatches a whole tree.
 */
function completedSpecDirs(ref) {
  // Listed by DIRECTORY and filtered here, never by a `*/tasks.md` pathspec: `git ls-tree` does
  // NOT expand glob pathspecs (it matches the `*` literally and returns nothing), while
  // `git ls-files` does. Passing one glob to both silently made this return [] in --base mode —
  // completed specs stayed in the corpus in CI but not at commit-msg, so a commit that passed the
  // hook could fail CI on a token surviving only in a historical spec. Verified: ls-tree 0 hits,
  // ls-files 19, on the same pathspec.
  // `:(top)` on BOTH pathspecs below, and `--full-name` on the grep: without them a run from a
  // subdirectory resolves `.spec-workflow/specs/` against the CWD and spells its results `../…`,
  // so no completed spec is ever excluded. This call was missed by the first path-anchoring pass.
  const withTasks = splitNul(listTracked(ref, ':(top).spec-workflow/specs/')).filter((p) =>
    p.endsWith('/tasks.md'),
  )
  let live = []
  try {
    live = stripRef(
      ref,
      splitNul(
        git([
          'grep',
          '-l',
          '-z',
          '--full-name', // repo-root-relative output; see the comment above `withTasks`
          '-F',
          '-e',
          '- [ ]',
          // The scope token goes AFTER the pattern: `git grep [opts] <pattern> [<rev>] -- <path>`.
          // Placed before the flags, git reads the next flag as a revision and aborts with
          // "unable to resolve revision: -l" — exit 2 on every run.
          ...grepScope(ref),
          '--',
          ':(top).spec-workflow/specs/*/tasks.md',
        ]),
      ),
    )
  } catch (err) {
    if (err.status !== 1 || err.signal) throw err // exit 1 = no matches; anything else is a failure
  }
  const liveDirs = new Set(live.map((p) => p.split('/').slice(0, 3).join('/')))
  return withTasks
    .map((p) => p.split('/').slice(0, 3).join('/'))
    .filter((dir) => !liveDirs.has(dir))
}

/** Pathspecs scoping every survivor search to the live prose corpus. */
function corpusPathspecs(ref) {
  const specs = CORPUS.map((r) => `:(top)${r}`)
  specs.push(`:(top,exclude)${MEMORY_PREFIX}`)
  for (const dir of completedSpecDirs(ref)) specs.push(`:(top,exclude)${dir}/`)
  return specs
}

/**
 * What the survivor search READS. `'--cached'` is the staged index — correct at commit-msg,
 * because git commits the index. In `--base` mode each commit in the range is checked against
 * ITS OWN tree: reading the index there would ask whether the claim survives at HEAD, which is
 * a different question and gets the answer wrong for every commit but the last.
 */
const grepScope = (ref) => (ref === '--cached' ? ['--cached'] : [ref])

/** `git grep <ref>` prefixes every path with `<ref>:`; `--cached` does not. */
const stripRef = (ref, paths) =>
  ref === '--cached'
    ? paths
    : paths.map((p) => (p.startsWith(`${ref}:`) ? p.slice(ref.length + 1) : p))

/** Tracked paths at `ref` (NUL-delimited, byte-safe), optionally filtered by a pathspec. */
function listTracked(ref, pathspec) {
  const args =
    ref === '--cached'
      ? ['ls-files', '-z', '--full-name', ...(pathspec ? ['--', pathspec] : [])]
      : [
          'ls-tree',
          '-r',
          '-z',
          '--full-tree', // same reason as --full-name on grep/ls-files: repo-root-relative output
          '--name-only',
          ref,
          ...(pathspec ? ['--', pathspec] : []),
        ]
  return git(args)
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Was `token` re-added anywhere in this commit — as a WHOLE token, not as a substring?
 *
 * A bare `addedText.includes(token)` is a fail-OPEN, and a sharp one: `'11807'.includes('1807')`
 * is true, so correcting 1807 in one file while any co-occurring line adds 11807 exonerates the
 * retraction and the surviving copy is never reported. `'1807'.includes('807')` breaks the
 * three-digit case the same way. The boundary rules live in NUM_RE and FILE_RE, but those run
 * when tokenising — this check has to re-apply them itself.
 */
export function reAdded(token, kind, addedText) {
  const body = escapeRe(token)
  const re =
    kind === 'value'
      ? new RegExp(`(?<![0-9A-Za-z_$#.-])${body}(?![0-9A-Za-z_.])`)
      : new RegExp(`(?<![\\w.@-])${body}(?![\\w-])`)
  return re.test(addedText)
}

/** Tokens of each class on one line. Returned as plain strings — the literal grep needle. */
export function tokensOf(line) {
  const nums = []
  if (!line.startsWith('Subproject commit ')) {
    for (const m of line.matchAll(NUM_RE)) {
      const tok = m[1]
      if (/^(19|20)\d{2}$/.test(tok)) continue // a year is not a claim
      if (tok.startsWith('0')) continue // `029`, `002` — migration-number fragments
      if (ISSUE_PREFIX_RE.test(line.slice(0, m.index))) continue
      nums.push(tok)
    }
  }
  const files = [...line.matchAll(FILE_RE)].map((m) => m[1])
  return { nums, files }
}

const flat = (lines, key) => lines.flatMap((l) => tokensOf(l)[key])

/**
 * The correction gate, at HUNK granularity.
 *
 * A removed token is a candidate only if the SAME hunk adds a token of its own class that
 * was not already on the hunk's removed lines — i.e. the hunk performs a swap. A hunk that
 * only deletes is a deduplication; a hunk that reworders prose without a replacement value
 * is not a correction. Calibrated over 120 commits: this gate cut the hit count by more
 * than half while the motivating instance kept firing.
 */
export function candidatesFor(hunk) {
  // No early return for an empty `hunk.add`: the replacement checks below already yield
  // nothing in that case, and a second guard implies a second mechanism that does not exist.
  const remN = new Set(flat(hunk.rem, 'nums'))
  const remF = new Set(flat(hunk.rem, 'files'))
  const addN = flat(hunk.add, 'nums').filter((t) => !remN.has(t))
  const addF = flat(hunk.add, 'files').filter((t) => !remF.has(t))
  return {
    nums: addN.length > 0 ? [...remN] : [],
    // A filename that resolves to a real path fires only on a genuine same-extension swap;
    // one that resolves to nothing is handled by the caller, which has the tracked set.
    files: addF.length > 0 ? [...remF].map((t) => ({ token: t, replacements: addF })) : [],
  }
}

/** Parse a unified diff body into hunks. */
export function parseHunks(body) {
  const hunks = []
  let binary = false
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '') // core.autocrlf welds \r onto the last token
    if (/^(Binary files .* differ|GIT binary patch)/.test(line)) binary = true
    if (line.startsWith('@@ ')) {
      hunks.push({ rem: [], add: [] })
      continue
    }
    if (hunks.length === 0) continue
    const h = hunks[hunks.length - 1]
    if (line.startsWith('-')) h.rem.push(line.slice(1))
    else if (line.startsWith('+')) h.add.push(line.slice(1))
  }
  // A non-empty body that yields no hunks and is not binary means the parser failed. That
  // must ABORT, never read as "this file removed nothing".
  if (hunks.length === 0 && body.trim().length > 0 && !binary) {
    throw new Error('diff body produced no hunks and is not a recognised binary patch')
  }
  return hunks
}

/** `Retracted-ok:` trailers, validated. An unusable waiver is an ERROR, never a silent pass. */
export function parseWaivers(message) {
  const waivers = new Map()
  const problems = []
  for (const line of message.split('\n')) {
    const m = TRAILER_RE.exec(line.trim())
    if (!m) continue
    const [, token, reason] = m
    const bare = reason
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .trim()
    if (reason.replace(/\s/g, '').length < 20 || EMPTY_REASONS.has(bare)) {
      problems.push(
        `Retracted-ok(${token}): the reason must state WHY the surviving occurrence is not the same claim (>= 20 chars, not a bare "${reason}")`,
      )
      continue
    }
    waivers.set(token, reason)
  }
  return { waivers, problems }
}

/** Files in the live corpus whose indexed content contains `token`, excluding `self`. */
function survivors(token, kind, self, pathspecs, ref) {
  // A short or whitespace-padded needle makes `grep -F` match nearly everything, the rarity
  // gate then reads ">= 3", and the guard passes silently. Hard error, never a skip.
  if (token.length < 3 || token.trim() !== token) {
    throw new Error(`refusing to search for a degenerate token ${JSON.stringify(token)}`)
  }
  // The SAME boundary rules `reAdded` applies, for the same reason. A bare `-F` is a SUBSTRING
  // match: `11807` contains `1807`, `my-plan.md` contains `plan.md`. With the two halves
  // disagreeing about what "the same token" is, a COMPLETE retraction gets blocked by an
  // unrelated longer number — fail-CLOSED, but wrong, and with no remedy but a waiver that
  // records a claim which was never stale.
  //
  // `-P` needs a PCRE-enabled git. Every mainstream build has one, and the failure is LOUD rather
  // than a silent fallback to over-matching: git exits 128 on an unsupported or malformed pattern,
  // the catch below recovers ONLY exit 1 ("no matches"), so 128 is rethrown and THIS GUARD exits 2.
  // (Measured: a bad PCRE gives 128, not 2 — the two exit codes belong to different processes.)
  const body = escapeRe(token)
  const pattern =
    kind === 'value'
      ? `(?<![0-9A-Za-z_$#.-])${body}(?![0-9A-Za-z_.])`
      : `(?<![\\w.@-])${body}(?![\\w-])`

  let out
  try {
    // --cached: git commits the INDEX. Searching the working tree is wrong in both
    // directions — an unstaged deletion reads as a survivor, an unstaged addition invents
    // one. `-e` so a token starting with `-` can never be read as a flag.
    out = git([
      '-c',
      'core.quotePath=false',
      '--no-pager',
      'grep',
      '-l',
      '-z',
      '-a',
      '-P',
      // Output paths are CWD-relative without this. From a subdirectory git returns
      // `../.claude/limits.json`, `inCorpus` rejects the `../` prefix, every corpus file is
      // skipped and the guard exits 0 having checked NOTHING. The `:(top)` pathspecs anchor the
      // INPUT scope only — they say nothing about how git spells what it gives back.
      '--full-name',
      '-e',
      pattern,
      ...grepScope(ref), // after the pattern — see completedSpecDirs
      '--',
      ...pathspecs,
    ])
  } catch (err) {
    if (err.status === 1 && !err.signal) return [] // 1 = no matches. err.status is null on a signal.
    throw err
  }
  return stripRef(ref, splitNul(out)).filter((p) => p !== self && inCorpus(p))
}

const NULL_SHA = /^0+$/

/**
 * Changed entries as `{path, src, dst}`, from `--raw -z`.
 *
 * `--raw` rather than `--name-status` because it also yields the pre- and post-image BLOB
 * SHAs, and a blob SHA is pure ASCII. That is what makes the per-path patch below byte-safe:
 * no path ever reaches argv, where Node would re-encode it as UTF-8 and a path holding an
 * invalid byte would name nothing. (`git diff` has no `--pathspec-from-file`, so passing the
 * path on stdin — the trick `check-file-size-guard.mjs` uses with `cat-file --batch` — is
 * not available here.)
 *
 * Rename detection is deliberately LEFT ON. Suppressing it decomposes a rename into D+A,
 * and since the hunk gate requires a removal and its replacement in the SAME hunk, a commit
 * that renames a file *and* corrects a value inside it would then produce an all-removed
 * hunk plus an all-added one and fire on neither — the correction becomes invisible. With
 * detection on, git pairs the blobs and the swap lands in one hunk, where the gate sees it.
 * (`--name-only` is never used anywhere in this file: it prints only a rename's DESTINATION.)
 */
function changedEntries(range) {
  const buf = git([
    '-c',
    'core.quotePath=false',
    '--no-pager',
    'diff',
    ...range,
    '--raw',
    '-z',
    '-M',
    // `diff.relative` can be set globally; with it, a diff run from a subdirectory OMITS every
    // change outside that directory entirely. Not a spelling problem like the flags above — a
    // silently truncated changed-file list.
    '--no-relative',
  ])
  const fields = splitNul(buf)
  const entries = []
  for (let i = 0; i < fields.length; ) {
    const meta = fields[i]
    // `:<srcmode> <dstmode> <srcsha> <dstsha> <status>`
    const m = /^:(\S+) (\S+) (\S+) (\S+) ([A-Z])\d*$/.exec(meta)
    if (!m) {
      // A desync shifts every later path by one and the guard then grades the WRONG files
      // at exit 0. Abort rather than skip.
      throw new Error(`unrecognised --raw record ${JSON.stringify(meta)}`)
    }
    const [, srcMode, dstMode, src, dst, status] = m
    // R/C carry TWO paths. Consuming the wrong number of fields is exactly how the NUL
    // stream desynchronises, shifting every later path by one.
    const pathCount = status === 'R' || status === 'C' ? 2 : 1
    entries.push({ path: fields[i + pathCount], src, dst, status, srcMode, dstMode })
    i += 1 + pathCount
  }
  return entries
}

/** One line per line of a blob, as latin1. */
function blobLines(sha) {
  return git(['cat-file', 'blob', sha]).toString('latin1').split('\n')
}

/**
 * Hunks for one entry. Diffing BLOB to BLOB keeps every argument ASCII.
 * An added file has no removed lines, so it can produce no candidate — but its content is
 * still every bit "added", and must reach `addedText` to exonerate a token moved into it.
 * A deleted file has no added lines and the hunk gate rejects it by construction.
 */
const GITLINK_MODE = '160000'

function hunksFor(entry) {
  // A SUBMODULE is a gitlink whose "blob" SHA is a COMMIT, so `git cat-file blob` on it fails and
  // the guard aborts at exit 2 — blocking every commit that touches a submodule, in a repo that
  // may have nothing to do with the corpus. A submodule pointer is a SHA, not prose, so there is
  // nothing here to grade: skip it. Latent in this repo (no .gitmodules today) and cheap to
  // prevent; found by CodeRabbit probing for gitlink entries.
  if (entry.srcMode === GITLINK_MODE || entry.dstMode === GITLINK_MODE) return []
  const srcMissing = NULL_SHA.test(entry.src)
  const dstMissing = NULL_SHA.test(entry.dst)
  if (srcMissing && dstMissing) return []
  if (srcMissing) return [{ rem: [], add: blobLines(entry.dst) }]
  if (dstMissing) return [{ rem: blobLines(entry.src), add: [] }]
  // `--no-relative` here too, and it is NOT redundant with the one on the raw diff: a
  // BLOB-to-BLOB diff also honours `diff.relative`, and from a subdirectory it returns EMPTY —
  // no hunks, no candidates, exit 0 having graded nothing. Measured; neither reviewer predicted
  // it, and the test written to cover the raw-diff flag is what surfaced it.
  const buf = git([
    '--no-pager',
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--text',
    '-U0',
    '--no-relative',
    entry.src,
    entry.dst,
  ])
  return parseHunks(buf.toString('latin1'))
}

/**
 * Check ONE commit's worth of change: `range` is what to diff, `message` is that commit's own
 * message, `ref` is the tree the survivor search reads.
 *
 * Kept per-commit deliberately. In `--base` mode it would be simpler to diff the whole range and
 * concatenate every message into one waiver map — and that would be WRONG in a way that widens
 * the only escape hatch: `parseWaivers` keys on the token alone, so a `Retracted-ok: 1807` written
 * in one commit would silently clear an unrelated `1807` finding introduced by another. A waiver
 * is scoped to the commit whose author wrote it, and nothing else.
 */
function checkCommit({ range, message, ref }) {
  const { waivers, problems } = parseWaivers(message)
  if (problems.length > 0) return { problems, offenders: [] }

  const entries = changedEntries(range)
  const pathspecs = corpusPathspecs(ref)
  const tracked = new Set(splitNul(listTracked(ref)).map((p) => p.split('/').pop()))

  // Every added line in the CORPUS side of this commit. A token reappearing here was REWORDED,
  // not retracted. Memory files are excluded: a tracker row quoting the old claim would otherwise
  // exonerate the very retraction it is recording. Waiver trailers live in the message, not the
  // diff, so they cannot leak into this set.
  let addedText = ''
  const perFile = new Map()
  for (const entry of entries) {
    const hunks = hunksFor(entry)
    perFile.set(entry.path, hunks)
    // CORPUS-scoped, to match the survivor search. Accumulating app-code additions too would
    // mean a token moved OUT of the documented set — corpus to source — exonerates a corpus
    // retraction that is still incomplete. `inCorpus` already excludes agent memory.
    if (inCorpus(entry.path)) {
      for (const h of hunks) addedText += `${h.add.join('\n')}\n`
    }
  }

  const offenders = []
  for (const [path, hunks] of perFile) {
    if (!inCorpus(path)) continue
    for (const hunk of hunks) {
      const { nums, files } = candidatesFor(hunk)
      const candidates = [
        ...nums.map((token) => ({ token, kind: 'value' })),
        ...files.map(({ token, replacements }) => ({
          token,
          kind: 'filename',
          // A filename naming no tracked file is false outright. One that does resolve is a
          // stale CITATION only when swapped for another name of the same extension —
          // otherwise it is a live reference being dropped, which is not this guard's business.
          resolves: tracked.has(token),
          sameExt: replacements.some((r) => r.split('.').pop() === token.split('.').pop()),
        })),
      ]
      for (const c of candidates) {
        if (c.kind === 'filename' && c.resolves && !c.sameExt) continue
        if (reAdded(c.token, c.kind, addedText)) continue
        if (waivers.has(c.token)) continue
        const others = survivors(c.token, c.kind, path, pathspecs, ref)
        // 0 = the retraction was complete. >= 3 = common vocabulary, not a distinctive claim.
        if (others.length >= 1 && others.length <= 2) {
          offenders.push({ path, token: c.token, kind: c.kind, others })
        }
      }
    }
  }

  return { problems: [], offenders }
}

export function main(args) {
  /** Each element is one commit's worth of work. Staged mode has exactly one. */
  let units
  if (args[0] === '--base') {
    if (!args[1]) {
      console.error('✖ retracted-phrase guard: --base requires a ref')
      return 2
    }
    // TWO-dot for commit ENUMERATION (agent-workflow.md); three-dot is for diffs.
    // `--no-merges` is load-bearing, not tidiness. On a `pull_request` event `actions/checkout`
    // checks out `refs/pull/N/merge`, so HEAD is a MERGE commit and `base.sha` is its first
    // parent. The merge would enter the range as a unit whose diff is the WHOLE PR and whose
    // message is an auto-generated "Merge ... into ..." carrying no `Retracted-ok:` trailer —
    // so every waiver written in the PR becomes unreachable and the required check blocks with
    // no remedy. A branch-internal merge of master breaks it the same way, and additionally
    // grades tokens from commits authored elsewhere.
    //
    // ACCEPTED RESIDUE: a merge's CONFLICT RESOLUTION can introduce text present in neither
    // parent, and skipping merges means CI never grades it. `--no-merges` filters on parent
    // COUNT, so an octopus merge is the same case, not an extra one. The commit-msg hook does — `git
    // merge` runs it like any other commit — so this is reachable only when that hook was
    // bypassed, which is the same hole CI exists to backstop. The alternative reviewed and
    // rejected was checking out `head.sha` in CI rather than the merge ref: it covers the
    // residue, but changes what EVERY step in that job sees (the test-title guard diffs against
    // the base there too) for a gap this narrow. `--no-merges` stays correct under either
    // checkout, which the ref change does not.
    //
    // NOT `-z`: rev-list ACCEPTS the flag and ignores it, still emitting newline-separated
    // output. Splitting that on NUL yields ONE blob of concatenated SHAs, and every later
    // `<sha>^` then fails — the guard aborts at exit 2 instead of checking anything.
    const shas = git(['rev-list', '--reverse', '--no-merges', `${args[1]}..HEAD`])
      .toString('latin1')
      .split('\n')
      .filter(Boolean)
    units = shas.map((sha) => ({
      range: [`${sha}^`, sha],
      message: git(['log', '-1', '--format=%B', sha]).toString('utf8'),
      ref: sha,
    }))
    // A root commit has no `^`. Diff it against the empty tree rather than skipping it.
    for (const u of units) {
      try {
        git(['rev-parse', '--verify', `${u.ref}^`])
      } catch {
        u.range = [EMPTY_TREE, u.ref]
      }
    }
  } else if (args.length === 1 && !args[0].startsWith('--')) {
    let range = ['--cached']
    try {
      git(['rev-parse', '--verify', 'HEAD'])
    } catch {
      range = ['--cached', EMPTY_TREE] // first commit in a repo — not a reason to skip
    }
    units = [{ range, message: readFileSync(args[0], 'utf8'), ref: '--cached' }]
  } else {
    console.error('✖ retracted-phrase guard: usage: <commit-msg-file> | --base <ref>')
    return 2
  }

  const offenders = []
  for (const unit of units) {
    const res = checkCommit(unit)
    if (res.problems.length > 0) {
      console.error('✖ retracted-phrase guard: unusable Retracted-ok trailer\n')
      for (const p of res.problems) console.error(`  ${p}`)
      return 1
    }
    offenders.push(...res.offenders)
  }

  if (offenders.length === 0) return 0

  console.error(
    '✖ retracted-phrase guard (code-style.md §10 cl.3): a claim this commit CORRECTED still stands elsewhere.\n',
  )
  for (const o of offenders) {
    console.error(`  ${o.path}  retracted the ${o.kind} \`${o.token}\``)
    for (const other of o.others) console.error(`    still present in: ${other}`)
    console.error(`    → correct it there too, or add to the commit message:`)
    console.error(`      Retracted-ok: ${o.token} — <why that occurrence is not the same claim>\n`)
  }
  console.error(
    'Searched: CLAUDE.md, .coderabbit.yaml, .claude/**, docs/**, .spec-workflow/** (live specs)',
  )
  console.error(
    'Excluded: .claude/agent-memory/** (narrates past claims verbatim), completed specs',
  )
  return 1
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`✖ retracted-phrase guard: check could not run — BLOCKING: ${err.message}`)
    console.error(
      '  This is an environmental failure, NOT a finding. Do NOT write a Retracted-ok trailer for it.',
    )
    exit(2)
  }
}
