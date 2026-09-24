#!/usr/bin/env node

// Fetches the head-commit copy of every PR file GitHub's diff API returns with no `patch`
// (large diffs, binaries) into `.pr-head/files/<n>`, so the CI reviewer (claude-review.yml,
// Decision 89) can read them — its checkout is the PR's base, and the reviewer step itself
// has no Bash or git. This script runs as a plain, unrestricted CI step before it. Copies take a
// sequence number, never the PR's path: a PR-named `CLAUDE.md` or `.claude/` would load as
// reviewer instructions. `.pr-head/INDEX.txt` maps each path to its copy.
//
// Usage: GH_TOKEN=<token> REPO=<owner/repo> PR_NUMBER=<n> HEAD_SHA=<sha> \
//          node .github/scripts/pr-head-files.mjs
// Exit:  0 = ran to completion — a per-file fetch failure is recorded in INDEX.txt, not fatal
//        1 = the pull-request files list itself could not be fetched

import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { argv, env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const OUT_DIR = '.pr-head'
const FILES_DIR = join(OUT_DIR, 'files')
const PER_PAGE = 100
const MAX_FILES = 3000 // GitHub's own cap on the PR files-list endpoint
const TIMEOUT_MS = 60_000

// ---------------------------------------------------------------- pure

/** Filenames GitHub returned with no `patch` — a removed file carries no head copy to fetch. */
export function selectPatchless(files) {
  return files.filter((f) => f.status !== 'removed' && !f.patch).map((f) => f.filename)
}

/** null when `p` is safe to join under OUT_DIR; otherwise the rejection reason. */
export function safePath(p) {
  if (p.startsWith('/')) return 'absolute path'
  if (p.split('/').includes('..')) return '.. path segment'
  if (p.startsWith('.git/')) return '.git/ path'
  return null
}

/** One INDEX.txt line. The path is a JSON string, so no filename can forge a line or a field. */
export function indexLine(r) {
  const path = JSON.stringify(r.path)
  return r.fetched ? `fetched ${path} → ${r.file}` : `not-fetched ${path} — ${r.reason}`
}

/** `results`: [{path, fetched, file?, reason?}]; a leading `truncated` when the list may be capped. */
export function indexLines(results, truncated) {
  return [...(truncated ? ['truncated'] : []), ...results.map(indexLine)]
}

// ---------------------------------------------------------------- I/O

async function listFiles({ repo, pr, token }) {
  const files = []
  for (let page = 1; page <= MAX_FILES / PER_PAGE; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=${PER_PAGE}&page=${page}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )
    if (!res.ok) throw new Error(`pulls/files page ${page} failed: ${res.status}`)
    const batch = await res.json()
    files.push(...batch)
    if (batch.length < PER_PAGE) return { files, truncated: false }
  }
  return { files, truncated: true }
}

async function fetchHeadCopy({ repo, path, ref, token, file }) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  )
  if (!res.ok) return { path, fetched: false, reason: `http ${res.status}` }
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    return { path, fetched: false, reason: 'not a plain file (submodule or directory)' }
  }
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  return { path, fetched: true, file }
}

async function tryFetch(opts) {
  try {
    return await fetchHeadCopy(opts)
  } catch (err) {
    return { path: opts.path, fetched: false, reason: `error: ${err.message}` }
  }
}

/** Fetches each candidate in turn, handing every result to `onResult` as it lands. */
async function fetchAll(candidates, opts, onResult) {
  for (const [i, path] of candidates.entries()) {
    const reason = safePath(path)
    const file = join(FILES_DIR, String(i + 1))
    await onResult(
      reason ? { path, fetched: false, reason } : await tryFetch({ ...opts, path, file }),
    )
  }
}

/** INDEX.txt grows one line per file, so a step killed mid-run keeps every finished entry. */
export async function main() {
  const { GH_TOKEN: token, REPO: repo, PR_NUMBER: pr, HEAD_SHA: ref } = env
  const { files, truncated } = await listFiles({ repo, pr, token })
  await mkdir(FILES_DIR, { recursive: true })
  const index = join(OUT_DIR, 'INDEX.txt')
  await writeFile(
    index,
    indexLines([], truncated)
      .map((l) => `${l}\n`)
      .join(''),
  )
  await fetchAll(selectPatchless(files), { repo, ref, token }, (r) =>
    appendFile(index, `${indexLine(r)}\n`),
  )
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((err) => {
    console.error(`✖ pr-head-files: ${err.message}`)
    exit(1)
  })
}
