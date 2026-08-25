#!/usr/bin/env node
/**
 * check-mirror-sync — is a clause that appears in N files still byte-identical in all N?
 *
 * Usage:  node .claude/hooks/check-mirror-sync.mjs '<anchor substring>'
 * Exit:   0 = every file carrying the anchor has an identical clause block
 *         1 = divergence, or any file could not be read / had no block  (FAIL CLOSED)
 *         2 = usage error
 *
 * Why this is a script and not a snippet in a rules file. The prose version kept sprouting
 * fail-opens — each review round found one the round before had missed, and no count is
 * given here because the sequence never converged. The ones on record:
 *   - hashed only the anchor LINE, so an edit to a later line of a multi-line clause
 *     left the digest unchanged;
 *   - `for f in $(git grep -l ...)` word-split a path containing a space, so the real file
 *     was never hashed AND never flagged;
 *   - `awk -v c="$CLAUSE"` applied C-style escape processing, so an anchor holding a
 *     backslash matched nothing;
 *   - no pipefail, and a `continue` on a missing anchor, so a failed search read as success;
 *   - a repeated anchor silently compared only the first block;
 *   - and this file's own first version compared `import.meta.url` against a hand-built
 *     `file://` string, which never matches when the checkout path contains a space (see
 *     the note at the CLI guard below) — so it exited 0 having done nothing.
 * Every one made it report "in sync" without having checked. That is the whole failure mode
 * worth caring about here: a verification tool that is silently absent is worse than none.
 * Prose cannot be tested. This can, and is — check-mirror-sync.test.mjs pins each case above,
 * and each guard is mutation-checked (delete one, exactly one test goes red).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Files tracked by git that contain `anchor` as a literal substring. */
export function filesContaining(anchor, cwd = process.cwd()) {
  let out
  try {
    out = execFileSync('git', ['grep', '-lFz', '--', anchor, '--', ':/'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (err) {
    // git grep exits 1 when there are no matches; anything else is a real failure.
    if (err && err.status === 1) return []
    throw err
  }
  return out.split('\0').filter(Boolean)
}

/**
 * The clause block: the anchor's line through to the next blank line (or EOF).
 * Literal `indexOf`, never a regex — the anchor is fixed-string by contract, so a
 * backslash or a `.*` in it must match itself.
 */
export function clauseBlock(text, anchor) {
  const lines = text.split('\n')
  const starts = lines.reduce((acc, l, i) => (l.includes(anchor) ? [...acc, i] : acc), [])
  if (starts.length === 0) return null
  // More than one candidate block means we cannot say WHICH one the sweep should compare.
  // Taking the first silently under-checks the rest — the exact silent-omission class this
  // tool exists to close — so it is an error, not a choice.
  if (starts.length > 1) return { ambiguous: starts.length }
  const block = []
  for (let i = starts[0]; i < lines.length; i++) {
    block.push(lines[i])
    if (i > starts[0] && lines[i].trim() === '') break
  }
  return block.join('\n')
}

export function digest(block) {
  return createHash('sha256').update(block, 'utf8').digest('hex').slice(0, 12)
}

/** @returns {{ ok: boolean, rows: Array<{file: string, digest: string|null, error?: string}> }} */
export function checkMirrors(anchor, cwd = process.cwd()) {
  const files = filesContaining(anchor, cwd)
  const rows = files.map((file) => {
    let block
    try {
      block = clauseBlock(readFileSync(`${cwd}/${file}`, 'utf8'), anchor)
    } catch (err) {
      return { file, digest: null, error: `unreadable: ${err.message}` }
    }
    // git grep said the anchor is here. If we cannot extract a block, the tool has
    // failed to check this file — that is a FAILURE, never a skip.
    if (block === null)
      return { file, digest: null, error: 'anchor matched by git but not extractable' }
    if (typeof block === 'object') {
      return {
        file,
        digest: null,
        error: `anchor appears ${block.ambiguous}x — cannot tell which block to compare`,
      }
    }
    return { file, digest: digest(block) }
  })
  const digests = new Set(rows.filter((r) => r.digest).map((r) => r.digest))
  const ok = rows.length > 0 && rows.every((r) => r.digest) && digests.size === 1
  return { ok, rows }
}

// NB: compare real paths, not a hand-built file:// string. `import.meta.url` percent-encodes
// spaces, so `file://${process.argv[1]}` never matches when the checkout path contains one —
// the CLI then silently does nothing and exits 0. That is the same path-with-spaces class this
// tool exists to catch, and it bit this file on its first run.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  const anchor = process.argv[2]
  if (!anchor) {
    console.error("usage: check-mirror-sync.mjs '<anchor substring>'")
    process.exit(2)
  }
  const { ok, rows } = checkMirrors(anchor)
  for (const r of rows)
    console.log(`${r.digest ?? 'ERROR'.padEnd(12)}  ${r.file}${r.error ? `  (${r.error})` : ''}`)
  if (rows.length === 0) {
    console.error('no tracked file contains that anchor — nothing was checked')
    process.exit(1)
  }
  if (!ok) {
    console.error('MIRRORS DIVERGED (or a file could not be checked)')
    process.exit(1)
  }
  console.log(`in sync across ${rows.length} file(s)`)
}
