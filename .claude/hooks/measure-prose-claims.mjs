#!/usr/bin/env node

// Measurement tool for the prose-claims guard. NOT a gate: it is wired into no lefthook
// stage and no CI job, and it exits 0 whatever it finds.
//
// It exists because the numbers that justify the guard — its static baseline size and how
// often it would have blocked — are exactly the kind of figure this programme forbids
// asserting without a runnable derivation (`code-style.md` §10 cl.2 and cl.7). A figure
// quoted from a scratchpad script that was deleted is unfalsifiable. This is that script,
// committed, so any reader can re-run it and get a number rather than a sentence.
//
// Usage:  node .claude/hooks/measure-prose-claims.mjs [--commits <N>] [--verbose]
//
// What "would have blocked" means here: the commit ADDS a claim line that its parent's tree
// did not carry. That is the guard's real behaviour at introduction — the baseline
// grandfathers what already exists, so only a NEWLY ADDED claim line blocks. It deliberately
// ignores the baseline file's current contents, which are a snapshot of one moment and would
// make the historical rate unreproducible a week later.
//
// Bounds: it reads the post- and pre-image BLOBS of each changed corpus file, so it sees
// exactly what the guard would see at that commit — but it does not replay the completed-spec
// exclusion per commit (a spec completed since would be excluded retroactively), and it does
// not evaluate merge commits.

import { execFileSync } from 'node:child_process'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  capValues,
  claimKey,
  contextRe,
  findClaims,
  parseWaiver,
  proseLines,
} from './check-prose-claims.mjs'

const MAX_BUFFER = 64 * 1024 * 1024
const NULL_SHA = /^0+$/

const git = (args) => execFileSync('git', args, { maxBuffer: MAX_BUFFER })
const gitText = (args) => git(args).toString('utf8')

/** Same corpus definition as the guard, re-derived from its module rather than retyped. */
const CORPUS = ['CLAUDE.md', '.coderabbit.yaml', '.claude/', 'docs/', '.spec-workflow/']
const MEMORY_PREFIX = '.claude/agent-memory/'
const EXCLUDED_PATHS = new Set(['.claude/run-log.md'])

function inCorpus(path) {
  if (path.startsWith(MEMORY_PREFIX)) return false
  if (EXCLUDED_PATHS.has(path)) return false
  return CORPUS.some((root) => (root.endsWith('/') ? path.startsWith(root) : path === root))
}

function splitNul(buf) {
  return buf
    .toString('utf8')
    .split('\0')
    .filter((s) => s.length > 0)
}

/** `{path, src, dst}` per changed entry of one commit. Rename detection ON, both paths kept. */
function changedEntries(sha) {
  // `--no-commit-id` because `diff-tree` leads with the SHA, which the record parser below
  // rejects — caught immediately when the first run aborted on it.
  // `--root` rather than `${sha}^`: the root commit HAS no parent, so the parent form makes git
  // exit non-zero and the whole measurement aborts at exit 2 the moment `--commits` reaches the
  // depth of history. `diff-tree --root` emits the root commit against the empty tree instead.
  const fields = splitNul(
    git([
      '--no-pager',
      'diff-tree',
      '--root',
      '-r',
      '--no-commit-id',
      sha,
      '--raw',
      '-z',
      '-M',
      '--no-relative',
    ]),
  )
  const entries = []
  for (let i = 0; i < fields.length; ) {
    const m = /^:(\S+) (\S+) (\S+) (\S+) ([A-Z])\d*$/.exec(fields[i])
    if (!m) throw new Error(`unrecognised --raw record ${JSON.stringify(fields[i])}`)
    const count = m[5] === 'R' || m[5] === 'C' ? 2 : 1
    entries.push({ path: fields[i + count], src: m[3], dst: m[4] })
    i += 1 + count
  }
  return entries
}

function blob(sha) {
  if (NULL_SHA.test(sha)) return null
  try {
    return git(['cat-file', 'blob', sha]).toString('utf8')
  } catch {
    return null
  }
}

/** Claim keys of one file's content. Waived lines are excluded, as in the guard. */
function keysOf(path, content, caps, ctx) {
  const keys = new Set()
  const seen = new Map()
  if (content === null) return keys
  for (const { text } of proseLines(path, content)) {
    if (findClaims(text, caps, ctx).length === 0) continue
    // An UNUSABLE waiver is not a waiver. The guard reports it as a problem and blocks; skipping
    // it here would let the measurement call a commit clean that the guard would have stopped,
    // which is the one direction a measurement must not be wrong in.
    const waiver = parseWaiver(text)
    if (waiver && !waiver.problem) continue
    // Occurrence index, exactly as the guard keys them. Without it, a commit that adds a SECOND
    // copy of an already-baselined claim produces no new key here and measures CLEAN, while the
    // guard sees the `#1` key and BLOCKS. I skipped this on a first pass, arguing a duplicate is
    // one block either way — wrong: the relevant case is the duplicate arriving when the
    // original is ALREADY baselined, and then the two disagree. A measurement that understates
    // the block rate is the one direction this tool must not be wrong in.
    const dupKey = `${path}\u0000${text.trim()}`
    const occurrence = seen.get(dupKey) ?? 0
    seen.set(dupKey, occurrence + 1)
    keys.add(claimKey(path, text, occurrence))
  }
  return keys
}

export function main(args) {
  let commits = 120
  let verbose = false
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--commits') {
      commits = Number(args[i + 1])
      if (!Number.isInteger(commits) || commits < 1)
        throw new Error('--commits needs a positive integer')
      i += 1
    } else if (args[i] === '--verbose') verbose = true
    else throw new Error(`unknown argument ${JSON.stringify(args[i])}`)
  }

  const limits = JSON.parse(gitText(['show', 'HEAD:.claude/limits.json']))
  const caps = capValues(limits)
  const ctx = contextRe(limits)

  const shas = gitText(['rev-list', '--no-merges', '-n', String(commits), 'HEAD'])
    .split('\n')
    .filter(Boolean)

  let blocked = 0
  const hits = []
  for (const sha of shas) {
    const added = []
    for (const e of changedEntries(sha)) {
      if (!inCorpus(e.path)) continue
      const before = keysOf(e.path, blob(e.src), caps, ctx)
      for (const k of keysOf(e.path, blob(e.dst), caps, ctx)) {
        if (!before.has(k)) added.push(k)
      }
    }
    if (added.length > 0) {
      blocked += 1
      hits.push({
        sha: sha.slice(0, 8),
        subject: gitText(['log', '-1', '--format=%s', sha]).trim(),
        added,
      })
    }
  }

  const pct = ((blocked / shas.length) * 100).toFixed(1)
  if (verbose) {
    for (const h of hits) {
      console.log(`${h.sha}  ${h.subject}`)
      for (const k of h.added) console.log(`    + ${k}`)
    }
    console.log('')
  }
  console.log(`commits examined (no-merges): ${shas.length}`)
  console.log(`would have blocked:           ${blocked} (${pct}%)`)
  return 0
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`measure-prose-claims: ${err.message}`)
    exit(2)
  }
}
