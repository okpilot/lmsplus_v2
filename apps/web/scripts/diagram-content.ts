/**
 * Pure validation for an authored `diagram_label` `diagram_config`. No I/O, no DB, no process
 * state — the importer and the seed script call it, and the co-located suite exercises it.
 *
 * `assertDiagramConfig` MIRRORS the DB CHECK `is_valid_diagram_config`
 * (supabase/migrations/20260702000100_questions_diagram_label_type.sql) so a config Postgres
 * would reject is rejected here first, naming the offending element instead of surfacing a bare
 * constraint violation. It adds ONE rule the DB cannot express: every zone and label id must be
 * the id DERIVED from its own content.
 *
 * That derived-id rule enforces the answer-oracle invariant documented at
 * apps/web/app/app/quiz/session/_components/diagrams/rwy-2709-layout.ts (its SECURITY
 * header block — cited without line numbers because they drift). Zone ids and label
 * ids are delivered to the student; the zone -> label mapping is not. With hand-authored ids
 * nothing stops a parallel naming scheme (zone `z_1` beside label `l_1`) from revealing that
 * mapping in the delivered payload, and no per-field check can see it. Derivation removes the
 * author's ability to write one: a zone id is a function of (image_ref, its position) and a
 * label id a function of its own text, so neither can hint at the other. `deriveZoneId` /
 * `deriveLabelId` are exported for the PIN TEST, which re-derives the literal ids stored in
 * `rwy-2709-layout.ts` and is what makes those literals trustworthy — neither the seed nor the
 * importer calls them, because both read the layout module's pre-computed literals, and that
 * module reaches the client bundle where `node:crypto` does not exist. Bounds are IMPORTED from `diagram-validation` rather than restated, so this
 * gate cannot drift from the runtime guards.
 *
 * Keep this file flat in scripts/ — knip's apps/web entry glob is `scripts/*.ts`.
 */

import { MAX_LABELS, MAX_ZONES } from '../app/app/quiz/actions/diagram-validation'
import { requireRecord, requireText } from './content-assertions'
import { deriveContentId } from './content-ids'

const CONFIG_KEYS = ['image_ref', 'zones', 'labels', 'answer'] as const
const ZONE_KEYS = ['id', 'x', 'y', 'w', 'h'] as const
const LABEL_KEYS = ['id', 'text'] as const
const ANSWER_KEYS = ['zone_id', 'label_id'] as const

export type DiagramZone = { id: string; x: number; y: number; w: number; h: number }
export type DiagramLabel = { id: string; text: string }
type AnswerPair = { zone_id: string; label_id: string }
type DiagramContent = { imageRef: string; zones: DiagramZone[]; labels: DiagramLabel[] }
type JsonRecord = Record<string, unknown>
type Bounds = { min: number; max: number }

/** A zone is identified by WHERE it is on WHICH image — never by what belongs in it. */
export function deriveZoneId(imageRef: string, index: number): string {
  return deriveContentId('z', [imageRef, String(index)])
}

/** A label is identified by its own visible text — never by the zone it answers. */
export function deriveLabelId(text: string): string {
  return deriveContentId('l', [text])
}

/** EXACT key set: a stray key is author metadata on a stored row, a missing one is a reject. */
function assertExactKeys(node: JsonRecord, allowed: readonly string[], at: string): void {
  const extra = Object.keys(node).filter((key) => !allowed.includes(key))
  if (extra.length > 0) {
    throw new Error(`${at}: unexpected key(s) ${extra.join(', ')} — allowed: ${allowed.join(', ')}`)
  }
  const missing = allowed.filter((key) => !(key in node))
  if (missing.length > 0) throw new Error(`${at}: missing key(s) ${missing.join(', ')}`)
}

function requireBoundedArray(raw: unknown, bounds: Bounds, at: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`${at} must be an array (got ${JSON.stringify(raw)})`)
  if (raw.length < bounds.min || raw.length > bounds.max) {
    throw new Error(
      `${at} must hold between ${bounds.min} and ${bounds.max} entries (got ${raw.length})`,
    )
  }
  return raw
}

function requireNumber(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${at} must be a number (got ${JSON.stringify(value)})`)
  }
  return value
}

function assertDistinct(values: readonly string[], at: string): void {
  const seen = new Map<string, number>()
  for (const [index, value] of values.entries()) {
    const prior = seen.get(value)
    if (prior !== undefined) {
      throw new Error(`${at}: '${value}' appears at index ${prior} and again at index ${index}`)
    }
    seen.set(value, index)
  }
}

/** The box must sit inside the [0,1] canvas and have real area — a zero-size zone renders as an
 *  unhittable drop target, and an overflowing one is partly off the artwork. */
function assertZoneBox(raw: JsonRecord, at: string): Omit<DiagramZone, 'id'> {
  const x = requireNumber(raw.x, `${at}.x`)
  const y = requireNumber(raw.y, `${at}.y`)
  const w = requireNumber(raw.w, `${at}.w`)
  const h = requireNumber(raw.h, `${at}.h`)
  if (x < 0 || x > 1) throw new Error(`${at}.x must be within [0,1] (got ${x})`)
  if (y < 0 || y > 1) throw new Error(`${at}.y must be within [0,1] (got ${y})`)
  if (w <= 0 || w > 1) throw new Error(`${at}.w must be greater than 0 and at most 1 (got ${w})`)
  if (h <= 0 || h > 1) throw new Error(`${at}.h must be greater than 0 and at most 1 (got ${h})`)
  if (x + w > 1) throw new Error(`${at}: x + w is ${x + w}, so the zone overflows the canvas`)
  if (y + h > 1) throw new Error(`${at}: y + h is ${y + h}, so the zone overflows the canvas`)
  return { x, y, w, h }
}

function assertZones(raw: unknown, at: string): DiagramZone[] {
  const entries = requireBoundedArray(raw, { min: 1, max: MAX_ZONES }, `${at}: zones`)
  return entries.map((entry, index) => {
    const label = `${at}: zones[${index}]`
    requireRecord(entry, label)
    assertExactKeys(entry, ZONE_KEYS, label)
    const id = entry.id
    requireText(id, `${label}.id`)
    return { id, ...assertZoneBox(entry, label) }
  })
}

function assertLabels(raw: unknown, at: string): DiagramLabel[] {
  const entries = requireBoundedArray(raw, { min: 1, max: MAX_LABELS }, `${at}: labels`)
  return entries.map((entry, index) => {
    const label = `${at}: labels[${index}]`
    requireRecord(entry, label)
    assertExactKeys(entry, LABEL_KEYS, label)
    const { id, text } = entry
    requireText(text, `${label}.text`)
    requireText(id, `${label}.id`)
    return { id, text }
  })
}

/** A zone id that is also a label id would correlate a delivered zone to its answer chip. */
function assertIdsDisjoint(zones: DiagramZone[], labels: DiagramLabel[], at: string): void {
  const zoneIds = new Set(zones.map((zone) => zone.id))
  const shared = labels.find((label) => zoneIds.has(label.id))
  if (shared !== undefined) {
    throw new Error(`${at}: '${shared.id}' is used as both a zone id and a label id`)
  }
}

/**
 * The answer-oracle rule: an id the author chose is an id the author can hide a hint in.
 *
 * Zones may legitimately be a SUBSET of a diagram's canonical zone list. A question asking for
 * the five legs of a circuit delivers five of the nine zones, and MUST — the DB requires
 * `answer.length === zones.length`, so shipping all nine and answering five is rejected. A zone
 * id is therefore matched against `deriveZoneId(ref, j)` for a STRICTLY ASCENDING canonical index
 * `j`, never against its position in this array: `derive(ref, 1)` permanently names the second
 * canonical zone, so renumbering a subset would make one id string mean different zones in
 * different questions of the same diagram.
 *
 * Searching for `j` instead of being handed it keeps the check self-contained, and requiring the
 * sequence to ascend also pins delivery order — zones reach the student in stored order
 * (`ORDER BY z.ord`), so a reordered subset would silently move the drop targets.
 *
 * BOUND CAVEAT: the search runs to MAX_ZONES (the schema ceiling), NOT to the number of zones
 * the named layout actually has — this validator is pure and has no access to the layout
 * registry. So a config carrying `deriveZoneId(ref, 20)` against a 9-zone diagram passes HERE.
 * It cannot reach the DB through the importer, which bounds keys to `layout.zones.length` in
 * `assertDiagramAuthoring` and re-bounds them in `resolveDiagramConfig`. Callers that hand this
 * function a hand-assembled object (seed-vfr-rt-training-eval.ts) do not get that bound and
 * must not treat a pass here as proof the index exists.
 */
function assertDerivedZoneIds(content: DiagramContent, at: string): void {
  let nextCanonical = 0
  content.zones.forEach((zone, index) => {
    let canonical = -1
    for (let j = nextCanonical; j < MAX_ZONES; j += 1) {
      if (zone.id === deriveZoneId(content.imageRef, j)) {
        canonical = j
        break
      }
    }
    if (canonical < 0) {
      throw new Error(
        `${at}: zones[${index}].id '${zone.id}' is not a derived id for image_ref '${content.imageRef}' at any canonical position at or after ${nextCanonical}. Zone ids come from (image_ref, canonical index) so they cannot hint at the answer, and a subset must keep them in ascending canonical order. Build them with deriveZoneId().`,
      )
    }
    nextCanonical = canonical + 1
  })
}

/** Label ids derive from the label's own text, so a subset needs no ordering rule — the pool is
 *  shuffled at delivery and carries no positional meaning. */
function assertDerivedLabelIds(content: DiagramContent, at: string): void {
  content.labels.forEach((label, index) => {
    const want = deriveLabelId(label.text)
    if (label.id !== want) {
      throw new Error(
        `${at}: labels[${index}].id must be the derived id '${want}' but is '${label.id}' — label ids come from the label's own text so they cannot hint at which zone they answer. Build them with deriveLabelId().`,
      )
    }
  })
}

function assertDerivedIds(content: DiagramContent, at: string): void {
  assertDerivedZoneIds(content, at)
  assertDerivedLabelIds(content, at)
}

/** Together these force a one-to-one zone <-> label map: every zone answered exactly once, and
 *  no chip reused — consume-on-place means a repeated label leaves a zone unwinnable. */
function assertAnswerCoversZones(pairs: AnswerPair[], content: DiagramContent, at: string): void {
  const zoneIds = new Set(content.zones.map((zone) => zone.id))
  const labelIds = new Set(content.labels.map((label) => label.id))
  for (const [index, pair] of pairs.entries()) {
    if (!zoneIds.has(pair.zone_id)) {
      throw new Error(`${at}: answer[${index}].zone_id '${pair.zone_id}' names no zone`)
    }
    if (!labelIds.has(pair.label_id)) {
      throw new Error(`${at}: answer[${index}].label_id '${pair.label_id}' names no label`)
    }
  }
  if (pairs.length !== content.zones.length) {
    throw new Error(
      `${at}: answer holds ${pairs.length} entries but there are ${content.zones.length} zones — every zone needs exactly one canonical label`,
    )
  }
  const answeredZones = pairs.map((pair) => pair.zone_id)
  const usedLabels = pairs.map((pair) => pair.label_id)
  assertDistinct(answeredZones, `${at}: answer zone_id`)
  assertDistinct(usedLabels, `${at}: answer label_id`)
}

function assertAnswerPairs(raw: unknown, content: DiagramContent, at: string): void {
  const entries = requireBoundedArray(raw, { min: 1, max: MAX_ZONES }, `${at}: answer`)
  const pairs = entries.map((entry, index): AnswerPair => {
    const label = `${at}: answer[${index}]`
    requireRecord(entry, label)
    assertExactKeys(entry, ANSWER_KEYS, label)
    const { zone_id, label_id } = entry
    requireText(zone_id, `${label}.zone_id`)
    requireText(label_id, `${label}.label_id`)
    return { zone_id, label_id }
  })
  assertAnswerCoversZones(pairs, content, at)
}

/** Full gate over one authored `diagram_config`. Throws on the first problem. */
export function assertDiagramConfig(raw: unknown, at: string): void {
  requireRecord(raw, at)
  assertExactKeys(raw, CONFIG_KEYS, at)
  const imageRef = raw.image_ref
  requireText(imageRef, `${at}: image_ref`)
  const zones = assertZones(raw.zones, at)
  const labels = assertLabels(raw.labels, at)
  const zoneIds = zones.map((zone) => zone.id)
  const labelIds = labels.map((label) => label.id)
  assertDistinct(zoneIds, `${at}: zone id`)
  assertDistinct(labelIds, `${at}: label id`)
  assertIdsDisjoint(zones, labels, at)
  assertDerivedIds({ imageRef, zones, labels }, at)
  assertAnswerPairs(raw.answer, { imageRef, zones, labels }, at)
}
