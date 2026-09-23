#!/usr/bin/env node

// Mechanical guard: a new TRACKED markdown file (.md/.mdx/.markdown) outside
// .claude/md-allowlist.json is blocked. A maintenance note belongs in the gitignored .work/,
// never in a new tracked doc (docs/decisions.md Decision 85).
//
// Usage:  node .claude/hooks/check-md-allowlist.mjs        (pre-commit; staged adds/renames)
//         node .claude/hooks/check-md-allowlist.mjs --all  (CI; every tracked markdown path)
// Exit:   0 = every candidate path is allowed
//         1 = a finding — a new markdown path outside the allowlist
//         2 = the check COULD NOT RUN (usage, git failure, malformed allowlist file,
//             unreadable .gitignore)

import { execFileSync } from 'node:child_process'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const MAX_BUFFER = 64 * 1024 * 1024

const ALLOWLIST_PATH = '.claude/md-allowlist.json'
const GITIGNORE_PATH = '.gitignore'

const KNOWN_FLAGS = new Set(['--all'])

// ---------------------------------------------------------------- markdown detection

const MD_EXT_RE = /\.(md|mdx|markdown)$/i

export function isMarkdown(path) {
  return MD_EXT_RE.test(path)
}

// ---------------------------------------------------------------- allowlist decision

/**
 * Allowed iff the path sits under a listed directory prefix, is one of the exact listed files,
 * its basename is one of the listed basenames (any directory), or it sits under a spec dir the
 * `.gitignore` re-includes (`specDirsFrom`).
 */
export function isAllowed(path, allow, specDirs) {
  if (allow.files.includes(path)) return true
  if (allow.basenames.includes(path.split('/').pop())) return true
  if (allow.dirs.some((d) => path.startsWith(d))) return true
  for (const d of specDirs) if (path.startsWith(d)) return true
  return false
}

/** `!.spec-workflow/specs/<name>/` re-include lines in `.gitignore` — the spec directories
 *  still tracked. */
const SPEC_REINCLUDE_RE = /^!\.spec-workflow\/specs\/([^/]+)\/$/

export function specDirsFrom(gitignoreText) {
  const dirs = new Set()
  for (const rawLine of gitignoreText.split('\n')) {
    const m = SPEC_REINCLUDE_RE.exec(rawLine.trimEnd())
    if (m) dirs.add(`.spec-workflow/specs/${m[1]}/`)
  }
  return dirs
}

// ---------------------------------------------------------------- git

function git(args, opts) {
  return execFileSync('git', args, { maxBuffer: MAX_BUFFER, ...opts })
}

function splitNul(buf) {
  return buf
    .toString('utf8')
    .split('\0')
    .filter((s) => s.length > 0)
}

// ---------------------------------------------------------------- allowlist file

function loadAllowlist() {
  const raw = git(['show', `:${ALLOWLIST_PATH}`]).toString('utf8')
  let obj
  try {
    obj = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${ALLOWLIST_PATH}: ${err.message}`)
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(`${ALLOWLIST_PATH}: top level must be an object`)
  }
  const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
  if (!isStringArray(obj.dirs))
    throw new Error(`${ALLOWLIST_PATH}: \`dirs\` must be a string array`)
  const badDir = obj.dirs.find((d) => !d.endsWith('/'))
  if (badDir !== undefined) {
    throw new Error(`${ALLOWLIST_PATH}: dirs entry ${JSON.stringify(badDir)} must end in '/'`)
  }
  if (!isStringArray(obj.files))
    throw new Error(`${ALLOWLIST_PATH}: \`files\` must be a string array`)
  if (!isStringArray(obj.basenames)) {
    throw new Error(`${ALLOWLIST_PATH}: \`basenames\` must be a string array`)
  }
  return { dirs: obj.dirs, files: obj.files, basenames: obj.basenames }
}

// ---------------------------------------------------------------- main

// `--no-relative`: under `diff.relative=true`, a run from a subdirectory lists only that subtree.
const STAGED_DIFF_ARGS = [
  'diff',
  '--cached',
  '--name-only',
  '-z',
  '--no-renames',
  '--no-relative',
  '--diff-filter=A',
]

export function main(args) {
  const flags = args.filter((a) => a.startsWith('--'))
  const positional = args.filter((a) => !a.startsWith('--'))
  if (positional.length > 0) {
    console.error(`✖ md-allowlist guard: takes flags only, got ${JSON.stringify(positional[0])}`)
    return 2
  }
  const unknown = flags.filter((f) => !KNOWN_FLAGS.has(f))
  if (unknown.length > 0) {
    console.error(`✖ md-allowlist guard: unknown flag(s) ${unknown.join(' ')}`)
    return 2
  }

  const all = flags.includes('--all')
  const allow = loadAllowlist()
  const specDirs = specDirsFrom(git(['show', `:${GITIGNORE_PATH}`]).toString('utf8'))

  const candidates = all
    ? splitNul(git(['ls-files', '-z', '--full-name', '--', ':/'])).filter(isMarkdown)
    : splitNul(git(STAGED_DIFF_ARGS)).filter(isMarkdown)

  const offenders = candidates.filter((p) => !isAllowed(p, allow, specDirs))
  if (offenders.length === 0) return 0

  console.error('✖ md-allowlist guard: a new tracked markdown path is outside')
  console.error(`  ${ALLOWLIST_PATH}\n`)
  for (const p of offenders) console.error(`  ${p}`)
  console.error(`\n  → move it to .work/ (gitignored), or add its folder to ${ALLOWLIST_PATH}`)
  return 1
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`✖ md-allowlist guard: check could not run — BLOCKING: ${err.message}`)
    exit(2)
  }
}
