#!/usr/bin/env node

// Measurement tool for the prose-paths guard. NOT a gate: it is wired into no lefthook stage
// and no CI job, and it exits 0 whatever it finds.
//
// It exists because the numbers that justify the guard — the narrowing funnel, and how much of
// the raw token stream each exclusion class carries — are exactly the kind of figure this
// programme forbids asserting without a runnable derivation (`code-style.md` §10 cl.2 and
// cl.7). A figure quoted from a scratchpad probe that was then deleted is unfalsifiable. This
// is that probe, committed, so any reader can re-run it and get a number rather than a
// sentence.
//
// Usage:  node .claude/hooks/measure-prose-paths.mjs [--classify] [--residual]
//
// Every helper is IMPORTED from the guard rather than retyped. A measurement that re-derives
// the scanner it measures is measuring a second implementation, and the two would drift on the
// first regex edit — which is precisely how a guard ends up defended by numbers that describe
// something else.
//
// The WIDE corpus here is the sibling's (`check-prose-claims.mjs § inCorpus`) minus `.json`,
// so the funnel shows what the spec-tree subtraction actually buys. The guard's own corpus —
// the BINDING surface — is the last line of the funnel, and is the only one it enforces on.
//
// Bounds: it grades the WORKTREE, never the index, so a number taken here describes the tree
// as it sits right now. It does not replay history, and it says nothing about how often the
// guard would have blocked a past commit.

import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'
import { inCorpus } from './check-prose-claims.mjs'
import {
  buildIndex,
  classify,
  collectCandidates,
  corpusFiles,
  ignoredTokens,
  normalise,
  trackedPaths,
} from './check-prose-paths.mjs'

/** The class the guard reports. Kept as a literal here so a rename in the guard shows up as a
 *  zero row rather than silently renaming this tool's conclusion too. */
const FINDING_CLASS = 'unresolved'

/**
 * The wide corpus: every file the sibling grades as prose, minus `.json`, which has no comment
 * syntax and therefore no prose lines at all.
 */
function wideCorpus(tracked) {
  return tracked.filter((p) => inCorpus(p) && !p.endsWith('.json'))
}

export function main(args) {
  for (const a of args) {
    if (a !== '--classify' && a !== '--residual') {
      throw new Error(`unknown argument ${JSON.stringify(a)}`)
    }
  }
  const showClasses = args.includes('--classify')
  const showResidual = args.includes('--residual')

  const tracked = trackedPaths()
  const index = buildIndex(tracked)
  const wide = wideCorpus(tracked)
  const binding = new Set(corpusFiles(tracked))

  const read = (path) => readFileSync(path, 'utf8')
  const { raw, candidates, problems } = collectCandidates(wide, read, index)

  const ignored = ignoredTokens(new Set(candidates.map((c) => normalise(c.tok))))
  const isIgnored = (t) => ignored.has(t)

  const byClass = new Map()
  const residual = []
  for (const c of candidates) {
    const cls = classify(c.tok, c.text, index, isIgnored)
    byClass.set(cls, (byClass.get(cls) ?? 0) + 1)
    if (cls === FINDING_CLASS) residual.push(c)
  }
  const onBinding = residual.filter((c) => binding.has(c.path))

  console.log('THE FUNNEL (worktree, now)')
  console.log(`  corpus files, wide (sibling corpus minus .json): ${wide.length}`)
  console.log(`  corpus files, binding (what the guard grades):   ${binding.size}`)
  console.log(`  raw candidate tokens:                            ${raw}`)
  console.log(`  non-resolving:                                   ${candidates.length}`)
  console.log(`  residual after the exclusion classes:            ${residual.length}`)
  console.log(`  on the binding surface:                          ${onBinding.length}`)
  console.log(
    `  distinct prose lines on the binding surface:     ${new Set(onBinding.map((c) => `${c.path} ${c.n}`)).size}`,
  )
  if (problems.length > 0) {
    console.log(`  UNREADABLE files (excluded from every count above): ${problems.length}`)
  }

  console.log('\nNON-RESOLVING TOKENS BY CLASS')
  for (const [cls, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${cls}`)
  }

  if (showClasses) {
    console.log('\nEVERY NON-RESOLVING TOKEN')
    for (const c of candidates) {
      console.log(`  [${classify(c.tok, c.text, index, isIgnored)}] ${c.path}:${c.n}  ${c.tok}`)
    }
  }
  if (showResidual) {
    console.log('\nRESIDUAL (the findings), binding surface marked *')
    for (const c of residual) {
      console.log(`  ${binding.has(c.path) ? '*' : ' '} ${c.path}:${c.n}  ${c.tok}`)
      console.log(`      | ${c.text.trim().slice(0, 140)}`)
    }
  }
  return 0
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`measure-prose-paths: ${err.message}`)
    exit(2)
  }
}
