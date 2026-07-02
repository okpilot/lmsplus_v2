// Pure placement helpers for DiagramLabelInput. Hoisted out of
// diagram-label-input.tsx to keep that component file under the 150-line cap
// (code-style.md §1) and to keep the component render-focused (logic lives
// elsewhere) — mirrors the role ordering-input-helpers.ts plays for OrderingInput.

import { isDiagramMappingArray } from '../../actions/diagram-validation'

export type DiagramZoneData = { id: string; x: number; y: number; w: number; h: number }
export type DiagramLabelChipData = { id: string; text: string }
export type DiagramMapping = { zoneId: string; labelId: string }

/** Droppable id for the chip pool region — dropping a placed chip here
 *  unplaces it (returns it to the pool) rather than moving it to a zone. */
export const DIAGRAM_POOL_DROPPABLE_ID = '__diagram_label_pool__'

/**
 * Places `labelId` into `zoneId`. Consume-on-place: if the label was already
 * placed in a different zone, it is removed from there first (a move, not a
 * duplicate placement). Setting a zone that already holds a different label
 * overwrites it — the displaced label implicitly returns to the pool (the
 * pool is derived as "every label not currently a value in the map").
 */
export function placeLabel(
  placement: Map<string, string>,
  zoneId: string,
  labelId: string,
): Map<string, string> {
  const next = new Map(placement)
  for (const [z, l] of next) {
    if (l === labelId) next.delete(z)
  }
  next.set(zoneId, labelId)
  return next
}

/** Removes `labelId` from wherever it is currently placed, returning it to the pool. */
export function unplaceLabel(placement: Map<string, string>, labelId: string): Map<string, string> {
  const next = new Map(placement)
  for (const [z, l] of next) {
    if (l === labelId) {
      next.delete(z)
      break
    }
  }
  return next
}

/** Labels not currently placed in any zone — the chips still available to drag. */
export function poolLabels(
  labels: DiagramLabelChipData[],
  placement: Map<string, string>,
): DiagramLabelChipData[] {
  const placed = new Set(placement.values())
  return labels.filter((l) => !placed.has(l.id))
}

/** Serializes the placement map to the wire {zoneId,labelId}[] shape submitted to the server. */
export function serializeMapping(placement: Map<string, string>): DiagramMapping[] {
  return Array.from(placement.entries()).map(([zoneId, labelId]) => ({ zoneId, labelId }))
}

export function hasAnyPlacement(placement: Map<string, string>): boolean {
  return placement.size > 0
}

/**
 * Restores the student's submitted placement (by zone/label id) when
 * revisiting an answered question; otherwise starts with an empty pool.
 * Falls back to empty unless every entry references a real zone AND a real
 * label — a tampered or corrupt persisted mapping must not render a
 * dangling/mismatched placement.
 */
export function placementFromSubmitted(
  zones: DiagramZoneData[],
  labels: DiagramLabelChipData[],
  submitted: boolean,
  submittedMapping?: DiagramMapping[],
): Map<string, string> {
  if (!submitted || !submittedMapping || submittedMapping.length === 0) return new Map()
  if (!isDiagramMappingArray(submittedMapping)) return new Map()
  const zoneIds = new Set(zones.map((z) => z.id))
  const labelIds = new Set(labels.map((l) => l.id))
  const valid = submittedMapping.every((m) => zoneIds.has(m.zoneId) && labelIds.has(m.labelId))
  if (!valid) return new Map()
  return new Map(submittedMapping.map((m) => [m.zoneId, m.labelId]))
}

/** Post-submit per-zone grading state. Undefined while unsubmitted/ungraded. */
export function zoneResult(
  zoneId: string,
  placement: Map<string, string>,
  correctMapping?: DiagramMapping[],
): 'correct' | 'incorrect' | undefined {
  if (!correctMapping) return undefined
  const correctLabelId = correctMapping.find((m) => m.zoneId === zoneId)?.labelId
  if (correctLabelId === undefined) return undefined
  return placement.get(zoneId) === correctLabelId ? 'correct' : 'incorrect'
}

/** True only when every zone in the canonical mapping is placed with its correct label. */
export function allPlacementsCorrect(
  placement: Map<string, string>,
  correctMapping: DiagramMapping[],
): boolean {
  return correctMapping.every((m) => placement.get(m.zoneId) === m.labelId)
}
