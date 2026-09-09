#!/usr/bin/env node
// Mechanical guard for the file-size limits that used to live as prose in
// `.claude/rules/code-style.md` §1 — and in eight other hand-maintained copies, two of
// which had already drifted (a fabricated "any file: max 300 lines" rule, and a
// suppression quietly raising the Server Action cap from 100 to 120).
//
// The limits, exclusions and grandfathered baseline are DATA in `.claude/limits.json`;
// this file is only the mechanism.
//
// RATCHET, not a gate. A hard "fail if any file exceeds its limit" check would have
// failed on day one — the measured baseline carries real violations that cannot be
// fixed here (migrations are immutable history; the over-limit Server Actions need
// splitting, tracked separately). So the check fails only on a REGRESSION:
//   (a) a file over its limit that is not in the baseline, or
//   (b) a baselined file that GREW.
// The baseline is visible in limits.json and may only shrink. Entries that no longer
// describe a live violation are REPORTED, because a purely path-keyed baseline would
// otherwise let a different file later occupy that path and inherit its allowance.
//
// Enumeration is `git ls-files`, NOT a filesystem walk. This repo keeps live git
// worktrees under `.claude/worktrees/`, each a full nested copy of apps/web and
// packages/db, excluded only by `.git/info/exclude` — which is LOCAL and untracked, so
// a readdir walk sees them on a developer machine and CI would disagree.
// `.claude/pipeline.test.mjs` switched to `git ls-files` for the same reason.
//
// Usage:  node .claude/hooks/check-file-size-guard.mjs            # whole tracked tree
//         node .claude/hooks/check-file-size-guard.mjs <file...>  # lefthook staged mode
// Exit:   0 = no regression
//         1 = a regression, OR the check could not run (FAIL CLOSED)

import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const LIMITS_PATH = '.claude/limits.json'

/**
 * Line count, editor semantics: the number of lines a reader sees.
 *
 * Equals `wc -l` for any newline-terminated file — which is every file here, since the
 * formatter enforces a final newline. Differs ONLY for a file lacking a trailing
 * newline, where this counts the final partial line and `wc -l` does not.
 *
 * Load-bearing, not a detail: `apps/web/app/app/quiz/actions/batch-submit.ts` sits at
 * EXACTLY 100 against a limit of 100. A naive `split('\n').length` reports 101 and
 * fails it; this reports 100 and passes it. Two reasonable implementations disagree
 * about a real file in this repo today.
 */
export function countLines(content) {
  if (content === '') return 0
  const parts = content.split('\n')
  return content.endsWith('\n') ? parts.length - 1 : parts.length
}

/**
 * Does this file declare itself a Server Action?
 *
 * Anchored at line start so a HEADER COMMENT mentioning the directive cannot match:
 * `resume-helpers.ts` and `load-draft-helpers.ts` each carry the line
 * "No `'use server'` — these are pure transforms", and an unanchored search matches the
 * text DENYING the directive. Those two files exist precisely because someone split a
 * file to obey this very rule; misreading them as Server Actions inverts the finding.
 */
export function declaresUseServer(content) {
  return /^\s*['"]use server['"]/m.test(content)
}

/** Compile a glob to a RegExp. Supports a leading-or-embedded `**` and a single `*`. */
export function globToRe(glob) {
  // Scanned left to right rather than by placeholder substitution. The placeholder
  // version round-tripped through sentinel strings and silently embedded NUL bytes in
  // the pattern (Biome's noControlCharactersInRegex caught it); it worked at all only
  // because the sentinels were consistently wrong on both sides of the round trip.
  const SPECIAL = /[.+^${}()|[\]\\?]/
  let out = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*' && glob[i + 2] === '/') {
        out += '(?:.*/)?' // `**/` — zero or more directory segments
        i += 3
      } else if (glob[i + 1] === '*') {
        out += '.*' // `**` — any depth, separators included
        i += 2
      } else {
        out += '[^/]*' // `*` — within a single path segment
        i += 1
      }
      continue
    }
    out += SPECIAL.test(c) ? `\\${c}` : c
    i += 1
  }
  // Case-insensitive: a 300-line `Weird.TSX` matched no rule at all and passed clean.
  return new RegExp(`^${out}$`, 'i')
}

export function isExcluded(file, limits) {
  const base = basename(file)
  if (limits.excludeBasenamePatterns.some((p) => new RegExp(p).test(base))) return true
  return limits.excludeGlobs.some((g) => globToRe(g).test(file))
}

/**
 * Which limit applies. Order matters — the FIRST matching rule wins, so the most
 * specific classifications come first in limits.json. Returns null when none applies.
 */
export function classify(file, content, limits) {
  if (isExcluded(file, limits)) return null
  for (const rule of limits.rules) {
    if (!globToRe(rule.glob).test(file)) continue
    if (rule.requiresUseServer && !declaresUseServer(content)) continue
    return { kind: rule.kind, max: rule.max }
  }
  return null
}

/**
 * Evaluate a set of files.
 * @returns {{regressions: Array, liveViolators: Set<string>}}
 *   liveViolators = baselined paths that are STILL over their limit.
 */
export function evaluate(files, readFile, limits) {
  const baseline = limits.baseline ?? {}
  const regressions = []
  const liveViolators = new Set()

  for (const file of files) {
    let content
    try {
      content = readFile(file)
    } catch (err) {
      // A transient race and a PERMANENTLY unreadable path are not the same thing, and
      // swallowing both was a silent exemption. Git stores a symlink's target TEXT as its
      // blob, so a committed symlink whose target is absent passes every git-side check
      // while `readFileSync` follows it and throws ENOENT forever — exempting that path
      // from every limit, in pre-commit and CI alike, with exit 0.
      // `lstatSync` does NOT follow the link, so it succeeds exactly when the entry is
      // still there and the read failure is real rather than a mid-run deletion.
      let stillPresent = true
      try {
        lstatSync(file)
      } catch {
        stillPresent = false
      }
      if (stillPresent) {
        regressions.push({
          file,
          n: null,
          max: null,
          kind: 'unreadable',
          why: `tracked but unreadable (${err.code ?? err.message}) — no limit can be applied`,
        })
      }
      continue
    }
    const rule = classify(file, content, limits)
    if (!rule) continue

    const n = countLines(content)
    if (n <= rule.max) continue

    const allowed = baseline[file]
    if (allowed === undefined) {
      regressions.push({ file, n, max: rule.max, kind: rule.kind, why: 'new violation' })
      continue
    }
    liveViolators.add(file)
    if (n !== allowed) {
      // BOTH directions fail, and the shrink case is the load-bearing half. The baseline
      // is keyed on PATH alone, so if a baselined file's content is replaced in place by
      // unrelated content that is still over the limit but under the old allowance, a
      // "grew only" check reports nothing at all — the path never leaves liveViolators,
      // so not even the stale-entry warning fires. Requiring the recorded number to stay
      // EXACT turns that silent absorption into a visible edit: whoever shrinks the file
      // must write the new number down, which is also what "the baseline may only shrink"
      // means operationally.
      const why =
        n > allowed
          ? `grew past its grandfathered size of ${allowed}`
          : `is ${allowed - n} line(s) smaller than its grandfathered size of ${allowed} — tighten the baseline to ${n}`
      regressions.push({ file, n, max: rule.max, kind: rule.kind, why })
    }
  }
  return { regressions, liveViolators }
}

/**
 * Baseline rows that no longer describe a live violation — the file was deleted, or it
 * was split and is now compliant. Reported, never auto-applied: silently rewriting the
 * data file from inside the check would let it launder its own baseline.
 */
export function staleBaselineEntries(liveViolators, limits) {
  return Object.keys(limits.baseline ?? {}).filter((p) => !liveViolators.has(p))
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
}

function main(args) {
  const limits = JSON.parse(readFileSync(LIMITS_PATH, 'utf8'))
  const all = trackedFiles()
  const read = (f) => readFileSync(f, 'utf8')

  // The whole tree is always evaluated, so stale-baseline drift is visible on every run.
  const whole = evaluate(all, read, limits)
  const stale = staleBaselineEntries(whole.liveViolators, limits)

  // In staged mode only the passed files can BLOCK — a commit is not failed by a file
  // it did not touch. Paths not tracked by git are ignored (see the header).
  const scoped = args.length > 0 ? all.filter((f) => args.includes(f)) : all
  const { regressions } = evaluate(scoped, read, limits)

  if (stale.length > 0) {
    const s = stale.length === 1 ? 'y' : 'ies'
    console.error(`\n[file-size] ${stale.length} stale baseline entr${s} in ${LIMITS_PATH}:`)
    for (const p of stale) console.error(`  ${p}`)
    console.error('  These no longer describe a live violation. Prune them — a stale entry')
    console.error('  lets a different file later occupy that path under the old allowance.')
  }

  if (regressions.length === 0) return 0

  console.error(
    `\n[file-size] ${regressions.length} violation(s) of the limits in ${LIMITS_PATH}:\n`,
  )
  for (const r of regressions) {
    console.error(`  ${r.file}`)
    console.error(
      r.n === null ? `    ${r.why}` : `    ${r.n} lines — ${r.kind} limit is ${r.max} (${r.why})`,
    )
  }
  if (regressions.some((r) => r.n !== null)) {
    console.error('\n  Split the file. If it is genuinely unsplittable, add it to the')
    console.error(`  "baseline" in ${LIMITS_PATH} with a one-line reason in the PR.`)
  }
  if (regressions.some((r) => r.n === null)) {
    console.error('\n  An unreadable tracked path cannot be graded at all — a dangling symlink is')
    console.error('  the usual cause. Remove it or point it at a real file; do not baseline it.')
  }
  console.error('')
  return 1
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    // FAIL CLOSED. A guard that exits 0 when it cannot run is worse than no guard: it
    // reports "clean" forever and nobody looks again.
    console.error(`[file-size] check could not run — BLOCKING: ${err.message}`)
    exit(1)
  }
}
