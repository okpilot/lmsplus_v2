#!/usr/bin/env node

// Fetches the head-commit copy of every PR file GitHub's diff API returns with no `patch`
// (large diffs, binaries) into `.pr-head/<path>`, so the CI reviewer (claude-review.yml,
// Decision 89) can read them — its checkout is the PR's base, and the reviewer step itself
// has no Bash or git. This script runs as a plain, unrestricted CI step before it.
//
// Usage: GH_TOKEN=<token> REPO=<owner/repo> PR_NUMBER=<n> HEAD_SHA=<sha> \
//          node .github/scripts/pr-head-files.mjs
// Exit:  0 = ran to completion — a per-file fetch failure is recorded in INDEX.txt, not fatal
//        1 = the pull-request files list itself could not be fetched

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { argv, env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'

const OUT_DIR = '.pr-head'
const PER_PAGE = 100
const MAX_FILES = 3000 // GitHub's own cap on the PR files-list endpoint

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

/** `results`: [{path, fetched, reason?}]. Appends a `truncated` line when the list was capped. */
export function indexLines(results, truncated) {
  const lines = results.map((r) =>
    r.fetched ? `fetched ${r.path}` : `not-fetched ${r.path} — ${r.reason}`,
  )
  if (truncated) lines.push('truncated')
  return lines
}

// ---------------------------------------------------------------- I/O

async function listFiles({ repo, pr, token }) {
  const files = []
  for (let page = 1; page <= MAX_FILES / PER_PAGE; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=${PER_PAGE}&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) throw new Error(`pulls/files page ${page} failed: ${res.status}`)
    const batch = await res.json()
    files.push(...batch)
    if (batch.length < PER_PAGE) return { files, truncated: false }
  }
  return { files, truncated: true }
}

async function fetchHeadCopy({ repo, path, ref, token }) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' } },
  )
  if (!res.ok) return { path, fetched: false, reason: `http ${res.status}` }
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    return { path, fetched: false, reason: 'not a plain file (submodule or directory)' }
  }
  const dest = join(OUT_DIR, path)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
  return { path, fetched: true }
}

async function tryFetch(opts) {
  try {
    return await fetchHeadCopy(opts)
  } catch (err) {
    return { path: opts.path, fetched: false, reason: `error: ${err.message}` }
  }
}

async function fetchAll(candidates, opts) {
  const results = []
  for (const path of candidates) {
    const reason = safePath(path)
    results.push(reason ? { path, fetched: false, reason } : await tryFetch({ ...opts, path }))
  }
  return results
}

export async function main() {
  const { GH_TOKEN: token, REPO: repo, PR_NUMBER: pr, HEAD_SHA: ref } = env
  const { files, truncated } = await listFiles({ repo, pr, token })
  const results = await fetchAll(selectPatchless(files), { repo, ref, token })

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'INDEX.txt'), `${indexLines(results, truncated).join('\n')}\n`)
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main().catch((err) => {
    console.error(`✖ pr-head-files: ${err.message}`)
    exit(1)
  })
}
