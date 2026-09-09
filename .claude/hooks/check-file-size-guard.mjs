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
//         node .claude/hooks/check-file-size-guard.mjs --stats     # per-rule compliance
// Exit:   0 = no regression
//         1 = a regression, OR the check could not run (FAIL CLOSED)

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const LIMITS_PATH = '.claude/limits.json'
const GUARD = '.claude/hooks/check-file-size-guard.mjs'

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
 * "No `'use server'` — these are pure transforms" and `resume-helpers.ts` "No
 * `'use server'` — these are invoked by the action"; an unanchored search matches the
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
export { stats }

export function evaluate(files, readFile, limits) {
  const baseline = limits.baseline ?? {}
  const regressions = []
  const liveViolators = new Set()

  for (const file of files) {
    let content
    try {
      content = readFile(file)
    } catch (err) {
      // Every path reaching here came from `git ls-files`, so git already asserts it exists —
      // a read failure is therefore a problem whatever its cause, and this FAILS CLOSED.
      //
      // An earlier version tried to separate "gone" from "unreadable" with lstatSync, on the
      // model that lstat fails only when the entry is truly absent. That model is WRONG:
      // lstat must traverse every parent directory, so losing the `x` bit on one directory
      // (a stray chmod, an NFS mount, a build step running as another user) makes read AND
      // lstat fail identically for everything beneath it. Measured: `chmod 000` on one
      // directory hid NINE already-baselined violators and reported them as RESOLVED.
      //
      // The cost is that a file genuinely deleted between enumeration and read now blocks
      // instead of being skipped. That is the correct direction to fail: the tree changed
      // underneath the check, so its answer is not trustworthy — re-run it.
      regressions.push({
        file,
        n: null,
        max: null,
        kind: 'unreadable',
        why: `tracked but unreadable (${err.code ?? err.message}) — no limit can be applied`,
      })
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

/**
 * `--stats`: print per-rule totals. This exists because the compliance ratios were previously
 * written into `.claude/limits.json` as literals, three of which shipped WRONG — each measured
 * before the measuring commit's own files landed. Replacing them with an embedded one-liner was
 * worse: it carried a `KIND` placeholder and threw when run as written, so it LOOKED checkable
 * and was not. A flag cannot rot that way — it is executed by the same code that enforces.
 */
function stats(limits, all, read) {
  const byKind = new Map()
  for (const file of all) {
    let content
    try {
      content = read(file)
    } catch {
      continue
    }
    const rule = classify(file, content, limits)
    if (!rule) continue
    const row = byKind.get(rule.kind) ?? { total: 0, over: 0, max: rule.max }
    row.total += 1
    if (countLines(content) > rule.max) row.over += 1
    byKind.set(rule.kind, row)
  }
  for (const [kind, r] of [...byKind].sort()) {
    const pct = Math.round(((r.total - r.over) / r.total) * 100)
    console.log(
      `  ${kind} (cap ${r.max}): ${r.total - r.over}/${r.total} comply (${pct}%), ${r.over} over`,
    )
  }
  return byKind
}

function main(args) {
  const limits = JSON.parse(readFileSync(LIMITS_PATH, 'utf8'))
  const all = trackedFiles()
  const read = (f) => readFileSync(f, 'utf8')

  if (args.includes('--stats')) {
    stats(limits, all, read)
    return 0
  }

  // The whole tree is always evaluated, so stale-baseline drift is visible on every run.
  const whole = evaluate(all, read, limits)
  const stale = staleBaselineEntries(whole.liveViolators, limits)

  // In staged mode only the passed files can BLOCK — a commit is not failed by a file
  // it did not touch. Paths not tracked by git are ignored (see the header).
  const scoped = args.length > 0 ? all.filter((f) => args.includes(f)) : all
  const { regressions } = evaluate(scoped, read, limits)

  if (stale.length > 0) {
    const plural = stale.length === 1 ? 'y' : 'ies'
    console.error(`\n[file-size] ${stale.length} stale baseline entr${plural} in ${LIMITS_PATH}:`)
    for (const p of stale) console.error(`  ${p}`)
    console.error('\n  These no longer describe a live violation. BLOCKING, not advisory: a file')
    console.error('  can leave its rule class by being RENAMED — `foo.ts` to `foo.test.ts` moves a')
    console.error('  Server Action from the 100-line cap to the 500-line test cap, and `use-x.ts`')
    console.error('  to `x.ts` moves a hook from 80 to 200 — and the only trace is this entry')
    console.error('  going stale, which reads as "resolved". Prune it deliberately, or restore')
    console.error(`  the file: \`node ${GUARD} --update-baseline\` writes the change for review.`)
  }

  if (regressions.length === 0) return stale.length > 0 ? 1 : 0

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
