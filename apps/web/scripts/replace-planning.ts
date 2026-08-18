/**
 * Pure planning logic for `--replace` (see import-vfr-rt-content.ts). Given the question_numbers
 * a content file authors versus which numbers are currently LIVE in the DB scope the file targets
 * (bank + topic + question_type), decides what happens to each number. No DB I/O — the importer
 * executes the plan and is the only thing that talks to Supabase.
 *
 * Fixes two defects (#1191), both found live on 2026-08-15:
 *
 *   1. A question_number REMOVED from the file (still live in the DB scope, no longer authored)
 *      used to never be matched by anything — `--replace` only ever looked AT the file's own num
 *      set, so a dropped question stayed active with no signal. `orphaned` names exactly this
 *      set, so the importer can soft-delete it and report the count.
 *
 *   2. Every re-import used to soft-delete THEN insert, which mints a fresh id for every matched
 *      row even when only its text changed. A session created before the re-import had already
 *      frozen the OLD id in `config.question_ids`; the runner kept serving the now-soft-deleted
 *      row, with no signal that anything had gone wrong. `toUpdate` names the numbers whose row
 *      the importer must UPDATE IN PLACE — preserving the id — instead of replacing.
 */

export type ReplacePlan = {
  /**
   * Authored by the file AND already live in this scope: update the existing row's content in
   * place. Never soft-delete + re-insert these — that is what mints the new id #1191 was filed
   * for, and it silently orphans any session that already froze the old id.
   */
  toUpdate: readonly string[]
  /** Authored by the file but not currently live in this scope: insert a new row. */
  toInsert: readonly string[]
  /**
   * Live in this scope but NOT authored by THIS file. INFORMATIONAL ONLY — no caller acts on it,
   * and none should: `planScope` discards it and computes scope-level `unaccounted` instead,
   * because "not in this file" is not "not in any file". Conflating the two is exactly what
   * soft-deleted 16 sibling rows (#1191). If you are looking for the set the importer deletes,
   * it is `ScopePlan.unaccounted`, and only under `--prune`.
   */
  orphaned: readonly string[]
}

/**
 * `fileNums` and `liveNums` are each assumed unique within themselves (the importer enforces
 * both: `main()` rejects a duplicate `num` across every loaded file, and `question_number` is
 * live-unique per `idx_questions_bank_number`). Order is preserved from the input arrays.
 */
export function planReplace(opts: {
  readonly fileNums: readonly string[]
  readonly liveNums: readonly string[]
}): ReplacePlan {
  const liveSet = new Set(opts.liveNums)
  const fileSet = new Set(opts.fileNums)
  const toUpdate: string[] = []
  const toInsert: string[] = []
  for (const num of opts.fileNums) {
    if (liveSet.has(num)) toUpdate.push(num)
    else toInsert.push(num)
  }
  const orphaned = opts.liveNums.filter((num) => !fileSet.has(num))
  return { toUpdate, toInsert, orphaned }
}

/** One content file's contribution to a scope: its path (for messages) and the numbers it authors. */
export type ScopeFile = { readonly rel: string; readonly nums: readonly string[] }

export type ScopePlan = {
  /** Per-file decisions, keyed by `rel`. `orphaned` is deliberately absent — see below. */
  readonly perFile: ReadonlyMap<
    string,
    { toUpdate: readonly string[]; toInsert: readonly string[] }
  >
  /**
   * Live in this scope and authored by NO file in the run. A property of the SCOPE, not of any
   * one file — which is the whole point. Computing it per file made every file's rows look like
   * every sibling file's orphans.
   */
  readonly unaccounted: readonly string[]
}

/**
 * Plan one DB scope (bank + topic + question_type) against EVERY file the run gave it.
 *
 * A pool is a FILE, but the scope is bank+topic+question_type, and several files can share one:
 * `vfr-rt-part3-mc-{numbers,emergency,posrep}.json` are all `P3_MC`/`multiple_choice` with
 * disjoint number prefixes. Diffing a single file against the whole scope therefore reported its
 * 16 sibling rows as orphans — a single-file `--replace` soft-deleted them and exited 0. Unioning
 * first is what makes `unaccounted` mean "no file authors this" rather than "this file doesn't".
 *
 * The caller decides what to DO with `unaccounted`; this function only names it. The importer
 * aborts unless `--prune` is passed, because a row no file authors is either a question genuinely
 * deleted from the content or a sibling file the operator forgot to pass, and nothing here can
 * tell those apart.
 */
export function planScope(opts: {
  readonly files: readonly ScopeFile[]
  readonly liveNums: readonly string[]
}): ScopePlan {
  const authored = new Set(opts.files.flatMap((f) => f.nums))
  const perFile = new Map<string, { toUpdate: readonly string[]; toInsert: readonly string[] }>()
  for (const file of opts.files) {
    // The per-file update/insert split is exactly `planReplace`; only the ORPHAN half differs,
    // and it differs because it must be computed against every file in the scope at once. Reusing
    // it here keeps one implementation of the split rather than a second copy that can drift.
    const { toUpdate, toInsert } = planReplace({ fileNums: file.nums, liveNums: opts.liveNums })
    perFile.set(file.rel, { toUpdate, toInsert })
  }
  // Deliberately NOT planReplace's `orphaned`: that is "live but not in THIS file", which is the
  // defect. This is "live but in NO file of the run".
  return { perFile, unaccounted: opts.liveNums.filter((n) => !authored.has(n)) }
}

/**
 * What `--replace` should DO about a scope's unaccounted rows. Extracted so the FAIL-CLOSED
 * decision is pinned by a test rather than living only in importer code — `planScope` names the
 * set, but naming it is not the safety property. The property is that the default deletes
 * nothing, and a test that only checks the naming would stay green if `!prune` were inverted.
 */
export function decideUnaccounted(opts: {
  readonly unaccounted: readonly string[]
  readonly prune: boolean
}): 'noop' | 'abort' | 'prune' {
  if (opts.unaccounted.length === 0) return 'noop'
  return opts.prune ? 'prune' : 'abort'
}
