/**
 * Shared assertions for the curated-content importers (scripts/content/*.json).
 *
 * `requireText` / `requireRecord` moved here verbatim from import-vfr-rt-content.ts so the
 * dialog_fill validator can reuse them: they serve every question type, so they must not live
 * in a type-named module. Keep this file flat in scripts/ — knip's apps/web entry glob is
 * `scripts/*.ts`, so a scripts/lib/ subdirectory would be reported as unused.
 */

/** Assert a content field is a present, non-blank string. `label` names the field for the error. */
export function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string (got ${JSON.stringify(value)})`)
  }
}

/**
 * Assert a parsed-JSON node is a plain object before any field is read off it. Without this,
 * `questions: [null]` (or a non-object root) crashes with a bare TypeError from the first
 * property access, instead of naming the file and index like every other content error here.
 */
export function requireRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object (got ${JSON.stringify(value)})`)
  }
}

/** The only `lifecycle` value a content file may carry to a production database. */
const RELEASED_LIFECYCLE = 'released'

/**
 * Refuse to carry a content file to a remote/production database unless it declares
 * `"lifecycle": "released"` EXACTLY.
 *
 * Fail-closed by construction: a single `!==` against the one permitted literal rejects an
 * absent key, a non-string, `"RELEASED"`, `" released"`, `"pilot"`, and anything else, so there
 * is no value a future editor can introduce that silently opens the gate. That matters because
 * the predecessor guard was the opposite shape — `status.startsWith('PILOT')`, a check for the
 * BAD state on a free-prose field — and it failed open the moment an author rewrote the prose
 * so it no longer began with that word. The field this reads carries no prose: it is a
 * two-valued lifecycle tag (`pilot` | `released`) with no other job, so editing the surrounding
 * narrative cannot disarm it.
 *
 * `lifecycle` is intentionally NOT optional-with-a-default. A file that forgets it is refused,
 * not admitted — the failure mode being guarded is un-evaluated content reaching the live
 * question bank, where it is immediately exam-eligible.
 */
export function assertReleasedForRemote(file: { lifecycle?: unknown }, rel: string): void {
  if (file.lifecycle !== RELEASED_LIFECYCLE) {
    throw new Error(
      `${rel}: refusing to write this file to a remote database — it must declare "lifecycle": "${RELEASED_LIFECYCLE}" (got ${JSON.stringify(file.lifecycle)}). Set it only once the batch has passed its co-driven eval.`,
    )
  }
}

/**
 * True only when `url`'s HOST is this machine. Stricter than the importer's `--force-remote`
 * refusal, which is a prefix match and so reads `http://localhost.example.com` — a perfectly
 * ordinary remote host — as local. Used to gate the destructive `--replace` flag, so it parses
 * the URL and compares the hostname exactly.
 *
 * The scheme is deliberately NOT part of the predicate: `https://localhost` is still this
 * machine. `new URL()` lowercases the hostname and returns IPv6 hosts bracketed, so `[::1]` is
 * the form that actually arrives. A hostname-shaped string is not accepted: `localhost:54321`
 * parses with `localhost:` as the SCHEME, leaving an empty hostname that matches nothing.
 *
 * Residual, accepted: a hostname cannot see through an SSH tunnel or `kubectl port-forward`,
 * so a `localhost:54321` pointing at prod passes. The mitigation for that is disclosure —
 * the caller prints the target URL and the rows it is about to touch before mutating.
 */
export function isLocalSupabaseUrl(url: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}
