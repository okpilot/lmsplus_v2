#!/usr/bin/env node
// Mechanical guard: block a commit message that CITES a commit SHA which does not
// resolve in this repository. Discharges part of learner row 42 — a self-reported
// "I ran / verified / updated X" citing a commit hash is a claim, not a fact, and
// `agent-workflow.md § Finding Validation` requires the artifact be checked before
// the claim is trusted. This hook makes the cheapest slice of that check automatic:
// a SHA that plain doesn't exist (typo, wrong repo, hallucinated) is caught before
// the message ever lands in history.
//
// Usage:  node .claude/hooks/check-commit-claims.mjs <commit-msg-file>
// Exit:   0 = every extracted ref resolves
//         1 = an unresolved/ambiguous ref, or the check itself could not run (FAIL CLOSED)
//
// Scope, deliberately narrow: this checks that a cited SHA EXISTS. It says nothing
// about whether the prose describing that commit is accurate — that is a human/critic
// judgment call, not a mechanical one. Do not extend this file to attempt it.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

/** Commit-context words that make a following hex token a citation, not incidental hex. */
const TRIGGER_WORDS = 'in|on|per|from|since|commit|of|replaying|by|after|before|for|as|to|head|via'

/** A trigger word directly preceding the token (optionally through a backtick), end-anchored. */
const TRIGGER_BEFORE_RE = new RegExp(`\\b(?:${TRIGGER_WORDS})\\s+$`, 'i')

/** A trigger word directly following the token (optionally through a backtick), start-anchored. */
const TRIGGER_AFTER_RE = new RegExp(`^\\s+(?:${TRIGGER_WORDS})\\b`, 'i')

/** Possessive: `<token>'s`. */
const POSSESSIVE_AFTER_RE = /^'s\b/

/** A bare parenthetical citation `(<sha>)` — a real idiom in this repo's history
 *  ("The master-merge (fb06ee55) silently kept..."), 15+ occurrences per 400 commits. */
const PAREN_BEFORE_RE = /\(\s*`?$/
const PAREN_AFTER_RE = /^`?\s*\)/

/** A third-party action pin — `actions/checkout@v6 (de0fac2)` — cites a FOREIGN repo's
 *  commit, which can never resolve here. Pinning actions to SHAs is recommended practice
 *  and recurs (commit 48919941 pins six at once), so the parenthetical rule must not claim
 *  those. Matched against the single token IMMEDIATELY before the `(`, never the whole line:
 *  a line-wide test lets any incidental `scope/pkg@ref` prose ("the email/templates@v2
 *  rename (<sha>)") suppress a real citation, and the guard then exits 0 reporting success —
 *  a SILENT DROP, which is strictly worse than a false block. */
const ACTION_PIN_RE = /^\S+\/\S+@\S/

/** The whitespace-delimited token immediately preceding an opening paren. */
function tokenBeforeParen(before) {
  const head = before.replace(/\(\s*`?$/, '').trimEnd()
  return head.slice(head.lastIndexOf(' ') + 1).trim()
}

/** Bare at the start of a line or list item: only whitespace/list-marker/backtick before it. */
const BARE_START_RE = /(?:^|\n)\s*[-*(]?\s*`?$/

/** A lowercase-hex run, 7-40 chars, not embedded in a longer identifier. */
const HEX_RE = /(?<![0-9a-zA-Z_])[0-9a-f]{7,40}(?![0-9a-zA-Z_])/g

function hasDigit(token) {
  return /[0-9]/.test(token)
}

function hasHexLetter(token) {
  return /[a-f]/.test(token)
}

/**
 * Normalise a raw commit-message body: drop git's `#` template comments, drop
 * trailer lines (Co-Authored-By / Claude-Session / Signed-off-by), blank out
 * URLs (Dependabot embeds foreign-repo SHAs in compare/<sha>...<sha> links), and
 * strip fenced code blocks.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  const lines = text
    .split('\n')
    // `^#\s` only: git's template comments are `# On branch ...`, while `#1255` is an
    // ISSUE REFERENCE and real content — 71 such lines in the last 400 messages against 1
    // template line. Dropping every `#` line discards a citation sharing it.
    .filter((line) => !/^#\s/.test(line))
    .filter((line) => !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(line))
  let out = lines.join('\n')
  out = out.replace(/https?:\/\/\S+/g, ' ')
  out = out.replace(/```[\s\S]*?```/g, ' ')
  return out
}

/**
 * Extract candidate commit-SHA references from a raw commit message.
 * A candidate is a 7-40 char lowercase-hex token containing at least one digit
 * AND at least one a-f letter, qualifying on ANY of four positions: preceded by a
 * commit-context word; carrying a possessive `'s`; a bare parenthetical `(<sha>)` whose
 * immediately-preceding token is not an `owner/repo@ref` action pin; or bare at the start
 * of a line/list item. Only that LAST, weakest position is cancelled when the token itself
 * directly precedes a commit-context word — the shape of a content digest
 * ("abc123ef in file.md"). The cancellation must never apply to the other three.
 * @param {string} text raw commit-message body
 * @returns {string[]} deduped tokens, in order of first appearance
 */
export function extractRefs(text) {
  const normalized = normalize(text)
  const seen = new Set()
  const out = []
  for (const m of normalized.matchAll(HEX_RE)) {
    const token = m[0]
    if (!(hasDigit(token) && hasHexLetter(token))) continue

    const before = normalized.slice(0, m.index)
    const after = normalized.slice(m.index + token.length)

    const afterForExclusion = after.startsWith('`') ? after.slice(1) : after
    const beforeForTrigger = before.endsWith('`') ? before.slice(0, -1) : before

    // POSITIVE evidence that this is a citation.
    const cited =
      TRIGGER_BEFORE_RE.test(beforeForTrigger) ||
      POSSESSIVE_AFTER_RE.test(afterForExclusion) ||
      (PAREN_BEFORE_RE.test(before) &&
        PAREN_AFTER_RE.test(after) &&
        !ACTION_PIN_RE.test(tokenBeforeParen(before)))

    // Bare at a line start is the WEAKEST signal, and the only one the
    // precedes-a-trigger-word exclusion may cancel: a content digest reads
    // "714eec4f in plan-critic.md". Applying that exclusion to a token with
    // positive evidence drops real citations — "in <sha> as", "by <sha> to",
    // "of <sha> on" are ordinary English and occur throughout this history,
    // including in the commit that introduced this guard. Cancelling those is
    // a SILENT DROP: exit 0, "0 ref(s) verified", on a fabricated SHA.
    if (!cited) {
      if (!BARE_START_RE.test(before)) continue
      if (TRIGGER_AFTER_RE.test(afterForExclusion)) continue
    }

    if (!seen.has(token)) {
      seen.add(token)
      out.push(token)
    }
  }
  return out
}

/**
 * Classify one candidate ref by asking git whether it resolves to a commit.
 * @param {string} token candidate hex ref
 * @param {(token: string) => { status: number, stderr: string }} runner injectable
 *   so tests can drive every branch without a real git process.
 * @returns {'resolved' | 'ambiguous' | 'absent' | 'error'}
 */
export function classifyRef(token, runner) {
  const { status, stderr = '' } = runner(token)
  if (status === 0) return 'resolved'
  if (/is ambiguous/.test(stderr)) return 'ambiguous'
  if (/Needed a single revision|unknown revision|not a valid object name/.test(stderr)) {
    return 'absent'
  }
  // Fail closed: `not a git repository`, any other `fatal:`, or anything unrecognised
  // is a check that could not run — never fall through to 'resolved'.
  return 'error'
}

/** Real `git rev-parse --verify` runner. NO --quiet: it collapses ambiguous and absent
 * into the same signature, which is exactly the distinction classifyRef needs. */
function gitRunner(token) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${token}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    return { status: 0, stderr: '' }
  } catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stderr: err.stderr ? err.stderr.toString() : '',
    }
  }
}

const REMEDY = {
  absent:
    'not in this repository — try `git fetch origin` first (a just-merged commit may not be fetched yet), then fix or drop the citation',
  ambiguous: 'the SHA prefix matches more than one object — cite a longer prefix',
}

/**
 * Classify every ref, aborting the process on an outcome that means the check
 * could not RUN (fail closed) rather than treating it as resolved.
 * @returns {{token: string, cls: string}[]} the non-resolved refs
 */
function collectOffenders(refs, runner) {
  const offenders = []
  for (const token of refs) {
    const cls = classifyRef(token, runner)
    if (cls === 'error') {
      console.error(
        `✖ commit-claims guard: could not verify '${token}' — git check failed. Aborting; this check could not run.`,
      )
      exit(1)
      return offenders
    }
    if (cls !== 'resolved') offenders.push({ token, cls })
  }
  return offenders
}

function main() {
  const msgFile = argv[2]
  if (!msgFile) {
    console.error('✖ commit-claims guard: usage: check-commit-claims.mjs <commit-msg-file>')
    exit(1)
    return
  }

  let text
  try {
    text = readFileSync(msgFile, 'utf8')
  } catch (err) {
    console.error(`✖ commit-claims guard: could not read '${msgFile}': ${err.message}`)
    exit(1)
    return
  }

  const refs = extractRefs(text)
  const offenders = collectOffenders(refs, gitRunner)

  if (offenders.length > 0) {
    console.error('✖ commit-claims guard: commit message cites unresolved SHA(s):')
    for (const o of offenders) {
      console.error(`  ${o.token}  (${o.cls}) → ${REMEDY[o.cls]}`)
    }
    exit(1)
    return
  }

  console.log(`✓ commit-claims guard: ${refs.length} ref(s) verified`)
}

// Run only when executed directly (not when the test imports the helpers).
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main()
}
