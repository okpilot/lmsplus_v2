/**
 * Shared diagram_label validation constants and helpers.
 *
 * The DB CHECK `is_valid_diagram_config` (mig 150) is the authoritative server
 * guard on the QUESTION's own zones/labels/answer arrays. This module is the
 * app/client-layer guard on the STUDENT'S SUBMITTED mapping — the
 * {zoneId, labelId} placements a student makes — shared by the Zod schemas
 * (check-non-mc-answer-schema.ts, draft-schema.ts), the localStorage
 * rehydrate guard (quiz-session-validators.ts), and the DB-draft resume guard
 * (load-draft-helpers.ts) so they stay in sync without hand-maintained parity
 * comments (mirrors the role ordering-validation.ts plays for `order`).
 */
import { z } from 'zod'

// Shared Zod fragment for a single submitted zone/label id. `.trim()` before
// min/max so a whitespace-only token can't pass `min(1)` — keeps the save-draft
// (draft-schema.ts) and grade (check-non-mc-answer-schema.ts) sibling schemas at
// parity, and matches isDiagramMappingEntry's `.trim().length > 0` runtime guard.
export const diagramIdSchema = z.string().trim().min(1).max(200)

// Upper bound for a submitted mapping / delivered zones array. Distractors
// mean labels.length MAY exceed zones.length (Decision 52), so labels get
// their own (larger) cap — mirrors MIN/MAX_ORDER_ITEMS in ordering-validation.ts.
export const MAX_ZONES = 50

export const MAX_LABELS = 60

export type DiagramMappingEntry = { zoneId: string; labelId: string }

/**
 * Per-element shape check — each entry must be a well-formed {zoneId, labelId}
 * pair of non-blank strings. Mirrors is_valid_diagram_config's non-blank id
 * checks (mig 150) so a blank id can't slip past the app-layer guard.
 */
export function isDiagramMappingEntry(value: unknown): value is DiagramMappingEntry {
  if (typeof value !== 'object' || value === null) return false
  const { zoneId, labelId } = value as { zoneId?: unknown; labelId?: unknown }
  return (
    typeof zoneId === 'string' &&
    zoneId.trim().length > 0 &&
    zoneId.trim().length <= 200 &&
    typeof labelId === 'string' &&
    labelId.trim().length > 0 &&
    labelId.trim().length <= 200
  )
}

/**
 * Array-level self-defence predicate: distinct zoneId (a zone can be placed at
 * most once) and distinct labelId (a chip is consumed on placement — it
 * cannot occupy two zones simultaneously). Unlike ordering's
 * isUniquePermutation, a diagram mapping is NOT required to be complete —
 * partial submissions and unused (distractor) labels are explicitly allowed
 * (Decision 52; mig 155's INVERTED self-defence mirrors this at the DB layer).
 */
export function isValidDiagramMapping(mapping: DiagramMappingEntry[]): boolean {
  const zoneIds = mapping.map((m) => m.zoneId)
  const labelIds = mapping.map((m) => m.labelId)
  return new Set(zoneIds).size === zoneIds.length && new Set(labelIds).size === labelIds.length
}

/**
 * Combined per-element + array-level + bounds check, for narrowing an
 * `unknown` value (localStorage rehydrate / DB draft resume) into a valid
 * DiagramMappingEntry[]. At least one placement is required — an empty array
 * means nothing was submitted.
 */
export function isDiagramMappingArray(value: unknown): value is DiagramMappingEntry[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ZONES) return false
  return value.every(isDiagramMappingEntry) && isValidDiagramMapping(value as DiagramMappingEntry[])
}
