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
import { readFileSync } from 'node:fs'
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

/** `!.spec-workflow/specs/<name>/` re-include lines in `.gitignore` — the single source for
 *  which spec directories are tracked at all. A spec not re-included here is gitignored, so a
 *  markdown file under it can never reach this guard as a tracked add in the first place; this
 *  function exists so `isAllowed` does not have to special-case that it is redundant. */
const SPEC_REINCLUDE_RE = /^!\.spec-workflow\/specs\/([^/]+)\/$/

export function specDirsFrom(gitignoreText) {
  const dirs = new Set()
  for (const rawLine of gitignoreText.split('\n')) {
    const m = SPEC_REINCLUDE_RE.exec(rawLine.trim())
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

/**
 * Paths this commit is ADDING to the tree, from `git diff --cached --name-status -z -M` — an `A`
 * record's own path, or an `R`/`C` record's DESTINATION only. `M`/`D` carry no path at all: a
 * modification or a deletion of an existing file is never a candidate, only a new arrival is.
 * Same `-z` record shape and desync guard as `stagedPaths` in check-prose-paths.mjs.
 */
export function addedPaths(raw) {
  const fields = splitNul(raw)
  const out = []
  for (let i = 0; i < fields.length; ) {
    const status = fields[i]
    if (!/^[A-Z]\d*$/.test(status)) {
      throw new Error(`unrecognised --name-status record ${JSON.stringify(status)}`)
    }
    const isRenameOrCopy = status[0] === 'R' || status[0] === 'C'
    const count = isRenameOrCopy ? 2 : 1
    if (status[0] === 'A') out.push(fields[i + 1])
    else if (isRenameOrCopy) out.push(fields[i + count])
    i += 1 + count
  }
  return out
}

// ---------------------------------------------------------------- allowlist file

function loadAllowlist() {
  const obj = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'))
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
  const specDirs = specDirsFrom(readFileSync(GITIGNORE_PATH, 'utf8'))

  const candidates = all
    ? splitNul(git(['ls-files', '-z', '--full-name'])).filter(isMarkdown)
    : addedPaths(git(['diff', '--cached', '--name-status', '-z', '-M'])).filter(isMarkdown)

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
