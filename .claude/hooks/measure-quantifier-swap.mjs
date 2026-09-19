#!/usr/bin/env node

// Measurement tool for a PROPOSED quantifier-swap check. NOT a gate: it is wired into no
// lefthook stage and no CI job, and it exits 0 whatever it finds.
//
// It exists because the number that would justify building the check — how often a fix
// commit correcting a §10 violation introduces a fresh one of the same shape — is exactly
// the kind of figure this programme forbids asserting without a runnable derivation
// (`code-style.md` §10 cl.2 and cl.7). A figure quoted from a scratchpad probe that was then
// deleted is unfalsifiable. This is that probe, committed, so any reader can re-run it and
// get a number rather than a sentence.
//
// Usage:  node .claude/hooks/measure-quantifier-swap.mjs [--commits <N>] [--head <sha>]
//         node .claude/hooks/measure-quantifier-swap.mjs --sha <sha> [--verbose]
//
// `--head` pins the window's endpoint. The default HEAD slides forward on every commit, so a
// figure recorded anywhere without a pinned endpoint stops re-deriving the moment the next
// commit lands — including the commit that records it.
//
// Bounds: a commit WARNING here means one file lost a line matching the detection class
// (an absolute quantifier or a bare ratio) and gained another matching line of the same
// class, in the same commit — a pairing worth a human re-read, nothing more. It cannot tell
// whether the ADDED claim is true, whether the REMOVED one was false, or whether the two
// even describe the same fact; it only flags that a re-verify-worthy pairing occurred. It
// does not replay the completed-spec exclusion, and — like its siblings — does not evaluate
// merge commits: the `--commits` window passes `--no-merges`, and `--sha` REJECTS a merge
// rather than grading it, because a combined diff omits a path matching a parent and would
// report the commit as examined and clean.

import { execFileSync } from 'node:child_process'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'
import { inCorpus } from './check-prose-claims.mjs'

const MAX_BUFFER = 64 * 1024 * 1024

const git = (args) => execFileSync('git', args, { maxBuffer: MAX_BUFFER })
const gitText = (args) => git(args).toString('utf8')

function splitNul(buf) {
  return buf
    .toString('utf8')
    .split('\0')
    .filter((s) => s.length > 0)
}

/**
 * The detection class a future guard would enforce — exported so that guard imports it from
 * here instead of re-deriving it. This script is the temporary home of this logic; it moves
 * into the guard (with this file demoted to a pure measurement tool) only if the measurement
 * below clears. Fixed by the learner's derivation — do not widen or narrow either regex.
 */
export const QUANT_RE = /\b(all|every|never|always|only|none|exactly)\b/i
export const RATIO_RE = /\d+\s*(\/|of)\s*\d+/

export function quantifierHits(line) {
  return QUANT_RE.test(line) || RATIO_RE.test(line)
}

/** Parent SHAs of one commit. A merge has more than one; its combined diff omits a path
 *  matching a parent, so grading one would silently report it as examined and clean. */
function parentsOf(sha) {
  return gitText(['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/).slice(1)
}

/** Every corpus path this commit touches. `--root` lets the root commit resolve like any
 *  other rather than aborting for lack of a parent. */
function changedFiles(sha) {
  const buf = git(['diff-tree', '--root', '-r', '--no-commit-id', '--name-only', '-z', sha])
  return splitNul(buf).filter(inCorpus)
}

/** Added/removed lines of one file's diff in this commit that match the detection class. */
function classHits(sha, path) {
  const text = gitText(['show', sha, '--format=', '--unified=0', '--', path])
  const removed = []
  const added = []
  for (const line of text.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+') && quantifierHits(line)) added.push(line.slice(1))
    if (line.startsWith('-') && quantifierHits(line)) removed.push(line.slice(1))
  }
  return { removed, added }
}

/** Files in this commit that lost a class-matching line and gained another — the swap. */
function gradeCommit(sha) {
  const hits = []
  for (const path of changedFiles(sha)) {
    const { removed, added } = classHits(sha, path)
    if (removed.length > 0 && added.length > 0) {
      hits.push({ path, removedLine: removed[0], addedLine: added[0] })
    }
  }
  return hits
}

function parseArgs(args) {
  let commits = 120
  let commitsGiven = false
  let verbose = false
  let sha = null
  let head = null
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--commits') {
      commits = Number(args[i + 1])
      if (!Number.isInteger(commits) || commits < 1) {
        throw new Error('--commits needs a positive integer')
      }
      commitsGiven = true
      i += 1
    } else if (args[i] === '--verbose') {
      verbose = true
    } else if (args[i] === '--sha') {
      sha = args[i + 1]
      if (!sha) throw new Error('--sha needs a value')
      i += 1
    } else if (args[i] === '--head') {
      head = args[i + 1]
      if (!head) throw new Error('--head needs a value')
      i += 1
    } else {
      throw new Error(`unknown argument ${JSON.stringify(args[i])}`)
    }
  }
  if (sha && commitsGiven) throw new Error('--sha and --commits are mutually exclusive')
  if (sha && head) throw new Error('--sha and --head are mutually exclusive')
  return { commits, verbose, sha, head }
}

function reportVerbose(hits) {
  for (const h of hits) {
    console.log(`${h.sha}  ${h.subject}`)
    for (const f of h.files) {
      console.log(`    ${f.path}`)
      console.log(`      - ${f.removedLine.trim()}`)
      console.log(`      + ${f.addedLine.trim()}`)
    }
  }
  console.log('')
}

export function main(args) {
  const { commits, verbose, sha, head } = parseArgs(args)
  if (sha && parentsOf(sha).length > 1) {
    throw new Error(
      '--sha does not accept a merge commit: its combined diff hides parent-specific changes',
    )
  }
  const shas = sha
    ? [sha]
    : gitText(['rev-list', '--no-merges', '-n', String(commits), head ?? 'HEAD'])
        .split('\n')
        .filter(Boolean)

  let warned = 0
  const hits = []
  for (const s of shas) {
    const files = gradeCommit(s)
    if (files.length > 0) {
      warned += 1
      hits.push({
        sha: s.slice(0, 8),
        subject: gitText(['log', '-1', '--format=%s', s]).trim(),
        files,
      })
    }
  }

  if (verbose) reportVerbose(hits)
  const pct = ((warned / shas.length) * 100).toFixed(1)
  console.log(`commits examined (no-merges): ${shas.length}`)
  console.log(`would have warned:            ${warned} (${pct}%)`)
  return 0
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`measure-quantifier-swap: ${err.message}`)
    exit(2)
  }
}
