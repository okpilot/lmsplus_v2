#!/usr/bin/env node
// Mechanical guard for the file-size limits that used to live as prose in
// `.claude/rules/code-style.md` §1 — and in eight other hand-maintained copies, two of
// which had already drifted: one invented a blanket any-file rule that exists nowhere, and
// one suppression quietly raised the Server Action cap inside the enforcing agent.
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
//         node .claude/hooks/check-file-size-guard.mjs --update-baseline  # rewrite for review
// Exit:   0 = no regression
//         1 = a regression, OR the check could not run (FAIL CLOSED)

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, relative } from 'node:path'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const LIMITS_PATH = '.claude/limits.json'
const GUARD = '.claude/hooks/check-file-size-guard.mjs'
const KNOWN_FLAGS = new Set(['--stats', '--update-baseline'])

/**
 * Line count, editor semantics: the number of lines a reader sees.
 *
 * Equals `wc -l` for any newline-terminated file — which is every file here, since the
 * formatter enforces a final newline. Differs ONLY for a file lacking a trailing
 * newline, where this counts the final partial line and `wc -l` does not.
 *
 * Load-bearing, not a detail: `apps/web/app/app/quiz/actions/batch-submit.ts` sits EXACTLY
 * at its cap. A naive `split('\n').length` counts one line more and fails it; this passes
 * it. Two reasonable implementations disagree about a real file in this repo today.
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
 * `load-draft-helpers.ts` carries "No `'use server'` — these are pure transforms" and
 * `resume-helpers.ts` carries "No `'use server'` — these are invoked by the action".
 * Neither declares the directive; an unanchored search matches the text DENYING it. Those two files exist precisely because someone split a
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
  // Case-insensitive: an over-limit `Weird.TSX` matched no rule at all and passed clean.
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
    // Exclusion FIRST: an excluded path is out of scope whatever its readability. Reading it
    // first meant a dangling symlink under an excluded glob produced an `unreadable` regression
    // that blocked every run — and no baseline row could clear it, because that branch returns
    // before the baseline is consulted. `isExcluded` needs no file content.
    if (isExcluded(file, limits)) continue
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
export function stats(limits, all, read) {
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

/**
 * `--update-baseline`: rewrite `baseline` from the live tree, for a human to review and commit.
 *
 * The check must NEVER do this on its own — a check that silently rewrites the record it is
 * judged against launders its own baseline. But exact-match blocking means every legitimate
 * shrink fails CI until the number is updated by hand, and a check that annoying gets disabled.
 * So: opt-in, prints every change, writes nothing else. Same shape as `eslint --fix` or a
 * snapshot `-u` — the human runs it and the diff is reviewable.
 */
function updateBaseline(limits, all, read) {
  const previous = limits.baseline ?? {}
  const next = {}
  for (const file of all) {
    let content
    try {
      content = read(file)
    } catch {
      // Keep an unreadable path's existing row rather than dropping it: this command must not
      // become a way to launder a violation out of the record by making it unreadable.
      if (previous[file] !== undefined) next[file] = previous[file]
      continue
    }
    const rule = classify(file, content, limits)
    if (!rule) continue
    const n = countLines(content)
    if (n > rule.max) next[file] = n
  }

  const added = Object.keys(next).filter((f) => previous[f] === undefined)
  const removed = Object.keys(previous).filter((f) => next[f] === undefined)
  const changed = Object.keys(next).filter(
    (f) => previous[f] !== undefined && previous[f] !== next[f],
  )

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.error('[file-size] baseline already matches the tree — nothing written.')
    return 0
  }
  for (const f of removed) console.error(`  - ${f} (was ${previous[f]}) — no longer a violation`)
  for (const f of changed) console.error(`  ~ ${f}: ${previous[f]} -> ${next[f]}`)
  for (const f of added)
    console.error(`  + ${f}: ${next[f]} — NEW violation, argue for it in the PR`)

  const sorted = Object.fromEntries(
    Object.keys(next)
      .sort()
      .map((k) => [k, next[k]]),
  )
  writeFileSync(LIMITS_PATH, `${JSON.stringify({ ...limits, baseline: sorted }, null, 2)}\n`)
  console.error(`\n[file-size] ${LIMITS_PATH} rewritten. REVIEW THE DIFF before committing —`)
  console.error('  a `+` line is a new violation being grandfathered, which needs an argument.')
  return 0
}

function main(args) {
  const limits = JSON.parse(readFileSync(LIMITS_PATH, 'utf8'))
  const all = trackedFiles()
  const read = (f) => readFileSync(f, 'utf8')

  // Flags are parsed BEFORE anything is treated as a file path, and a flag cannot be mixed
  // with paths. `args.includes('--stats')` was a positional-arg collision: a file literally
  // named `--stats` anywhere in argv turned an enforcement run carrying a real violation into
  // exit 0. Unreachable through today's two callers (lefthook's glob drops an extensionless
  // name; CI passes none) — but by luck of the callers, not by construction, and a future one
  // passing raw `git diff` paths would reintroduce it silently.
  const flags = args.filter((a) => a.startsWith('--'))
  const files = args.filter((a) => !a.startsWith('--'))
  const unknown = flags.filter((f) => !KNOWN_FLAGS.has(f))
  if (unknown.length > 0) {
    console.error(`[file-size] unknown flag(s): ${unknown.join(' ')} — BLOCKING`)
    return 1
  }
  if (flags.length > 0 && files.length > 0) {
    console.error('[file-size] a mode flag cannot be combined with file paths — BLOCKING')
    return 1
  }
  // Two known flags is the same trap one level up: both pass the unknown-flag and
  // flag-vs-path gates, then the first `if` wins and the other request is dropped with no
  // diagnostic and exit 0. On the escape valve specifically that reads as "it worked" while
  // the baseline was never written. Precedence between modes is not a thing to guess at.
  if (new Set(flags).size > 1) {
    console.error(
      `[file-size] ${[...new Set(flags)].join(' and ')} are separate modes — run one — BLOCKING`,
    )
    return 1
  }

  if (flags.includes('--stats')) {
    stats(limits, all, read)
    return 0
  }

  if (flags.includes('--update-baseline')) {
    return updateBaseline(limits, all, read)
  }

  // The whole tree is always evaluated, so stale-baseline drift is visible on every run.
  const whole = evaluate(all, read, limits)
  const stale = staleBaselineEntries(whole.liveViolators, limits)

  // In staged mode only the passed files can block a VIOLATION — a commit is not failed by a
  // violation in a file it did not touch. Paths not tracked by git are ignored (see the header).
  // Stale baseline rows are NOT scoped: they are computed whole-tree and block regardless, below.
  // The comment previously claimed the whole run was scoped, which the stale branch contradicts.
  //
  // Filtered from the whole-tree pass rather than re-evaluated: `evaluate` is per-file with no
  // cross-file state, so a second pass only re-reads every tracked file. Keyed on `files`, not
  // `args` — post-flag-parse, so a flag can never be mistaken for a path.
  // Paths are normalised to repo-root-relative BEFORE filtering, and an argument matching no
  // tracked path is a hard error. `files.includes(r.file)` is an exact string compare, so
  // `./x.ts` and an absolute path both matched nothing and silently returned 0 on a real
  // violation — verified. Today's only caller passes git-root-relative paths, so this held by
  // luck of the caller, which is the same shape as the flag/path collision above.
  const normalised = files.map((f) => {
    const rel = isAbsolute(f) ? relative(process.cwd(), f) : f
    return rel.replace(/^\.\//, '')
  })
  // Staged DELETIONS reach us through `{staged_files}` but are absent from `git ls-files`, so
  // without this every commit that removes a file was rejected as an unknown path — a
  // regression introduced by the unknown-path check itself, one commit earlier. Guarded: a
  // failed git call ABORTS rather than silently yielding an empty set, which would restore the
  // breakage while looking clean.
  let deleted
  try {
    deleted = new Set(
      execFileSync('git', ['diff', '--cached', '--diff-filter=D', '--name-only'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
        .split('\n')
        .filter(Boolean),
    )
  } catch (err) {
    console.error(`[file-size] cannot list staged deletions — BLOCKING: ${err.message}`)
    return 1
  }
  const unknownPaths = normalised.filter((f) => !all.includes(f) && !deleted.has(f))
  if (unknownPaths.length > 0) {
    console.error(
      `[file-size] argument(s) match no tracked path: ${unknownPaths.join(' ')} — BLOCKING`,
    )
    return 1
  }
  const regressions =
    normalised.length > 0
      ? whole.regressions.filter((r) => normalised.includes(r.file))
      : whole.regressions

  if (stale.length > 0) {
    const plural = stale.length === 1 ? 'y' : 'ies'
    console.error(`\n[file-size] ${stale.length} stale baseline entr${plural} in ${LIMITS_PATH}:`)
    for (const p of stale) console.error(`  ${p}`)
    console.error('\n  These no longer describe a live violation. BLOCKING, not advisory: a file')
    console.error('  can leave its rule class by being RENAMED — `foo.ts` to `foo.test.ts` moves a')
    console.error('  Server Action onto the test-file rule, `use-x.ts` to `x.ts` moves a hook onto')
    console.error('  the utility rule — and the only trace is this entry going stale, which reads')
    console.error('  as "resolved". Prune it deliberately, or restore')
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
