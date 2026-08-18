/**
 * Content-derived ids for authored question content (scripts/content/*.json).
 *
 * An id produced here is a FUNCTION OF THE CONTENT, never an author-supplied field, and that
 * is the entire point. `ordering` items and `diagram_label` zones/labels each carry an id that
 * is delivered to the student next to the content it names, so any id the author writes by
 * hand is a channel the answer key can travel down — deliberately (`z_correct_1`), or by
 * accident (zone ids and label ids authored in the same order, so `zone_1` pairs with
 * `label_1` and the mapping is readable from the delivered payload alone). Deriving the id
 * from the content leaves the author no field to encode anything into: the same text always
 * yields the same id, and nothing else about the item can influence it.
 *
 * This replaces an earlier heuristic gate that tried to DETECT answer-revealing ids by their
 * shape. It was retired because it rejected legitimate content — a heuristic on a free-form
 * string has no way to tell a leaky id from an innocent one, so it either misses leaks or
 * fails honest authors. Derivation has no such failure mode: there is no author input to judge.
 *
 * `ID_VERSION` is part of every id, so an id records the scheme that produced it. Bump it in
 * the same change that alters `normalizeForId`, the digest, or the slice width — stored rows
 * carry ids derived under the OLD scheme, and a silent change orphans them (the delivered zone
 * id would no longer match the stored `answer.zone_id`, and the question becomes ungradeable).
 * The version prefix makes such a change visible in the data rather than silent.
 *
 * Keep this file flat in scripts/ — knip's apps/web entry glob is `scripts/*.ts`.
 */

import { createHash } from 'node:crypto'

/** Scheme version, embedded in every derived id. See the header before changing it. */
export const ID_VERSION = '1'

/** Hex characters of the digest an id carries. 8 hex chars = 32 bits: ample for the tens of
 *  items a single question holds, and a collision is reported rather than silently accepted. */
const DIGEST_CHARS = 8

/**
 * The canonical form an id is derived from: trimmed, internal whitespace runs collapsed to a
 * single space, lowercased.
 *
 * Deliberately NOTHING else — punctuation is preserved. Stripping it would make `RWY 27` and
 * `RWY-27` derive one id, and in radiotelephony content those are different answers. What IS
 * folded is the set of differences a reader cannot see: trailing spaces, a double space that
 * survived an edit, and capitalisation. Two items differing only in those ways are the same
 * item to a student, so collapsing them into one id turns an invisible authoring slip into a
 * loud collision error instead of two visually identical, separately-addressable items.
 *
 * This function is a STABILITY CONTRACT. Its output is baked into ids stored in the database;
 * changing it changes every id derived afterwards. See `ID_VERSION` in the header.
 */
export function normalizeForId(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * `${prefix}${ID_VERSION}` followed by the first 8 hex characters of the SHA-256 of the
 * normalized parts joined by a single space — e.g. `o1a3f9c2b1`.
 *
 * `prefix` names the kind of thing being identified (`o` ordering item, `l` diagram label,
 * `z` diagram zone). It is PREPENDED to the digest, NOT hashed into it — only `parts` reaches
 * `update()`. So one text used as two kinds yields two ids that share all 8 digest characters
 * and differ solely in that leading character: `deriveContentId('z', ['Downwind leg'])` and
 * `deriveContentId('l', ['Downwind leg'])` are `z1…` and `l1…` over an identical digest.
 *
 * That single character is therefore load-bearing for any two kinds derived over the SAME
 * parts. Today that pair is ordering-item (`o`) vs diagram label (`l`) — both hash `[text]`,
 * so the prefix is the only thing keeping them apart. It is NOT what currently separates a
 * zone from a label: `deriveZoneId` hashes `[imageRef, index]` while `deriveLabelId` hashes
 * `[text]`, so those two differ in the hashed input as well, and the diagram gate's
 * zone-id/label-id disjointness rule would survive even a prefix-less scheme. Do not read
 * that as slack — it is an accident of today's parts domains, not a guarantee. Never strip,
 * normalize away, or compare ids without the prefix (an id-shortener or a v2 re-prefixing
 * scheme is the realistic way this breaks); collapsing two kinds onto one id is what
 * `is_valid_diagram_config` then rejects at INSERT, with no hint as to why.
 */
export function deriveContentId(prefix: string, parts: readonly string[]): string {
  const canonical = parts.map(normalizeForId).join(' ')
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return `${prefix}${ID_VERSION}${digest.slice(0, DIGEST_CHARS)}`
}

/** One derived id and the source text it came from, so a collision can name both sides. */
export type DerivedId = { id: string; source: string }

/**
 * Reject two items in the same collection that derive the same id.
 *
 * Two distinct causes land here and the message has to serve both. The likely one is
 * normalization: the sources differ only in case or spacing, so the author is staring at two
 * visibly different strings and needs to be told WHY they collided. The remote one is a real
 * SHA-256 prefix collision on genuinely different text. The message leads with normalization
 * and prints both sources, so either way the author can see the two strings side by side and
 * decide which to reword.
 *
 * Throws on the first collision rather than collecting them — a content file with two
 * colliding pairs is not usefully better than one with a single colliding pair.
 */
export function assertNoDerivedIdCollisions(ids: readonly DerivedId[], at: string): void {
  const seen = new Map<string, string>()
  for (const entry of ids) {
    const prior = seen.get(entry.id)
    if (prior !== undefined) {
      throw new Error(
        `${at}: ${JSON.stringify(prior)} and ${JSON.stringify(entry.source)} both derive the id '${entry.id}'. Ids come from NORMALIZED content — surrounding space is trimmed, internal whitespace runs collapse to one space, and case is folded — so two sources that differ only in capitalisation or spacing collide. Reword one of them.`,
      )
    }
    seen.set(entry.id, entry.source)
  }
}
