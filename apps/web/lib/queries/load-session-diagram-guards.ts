// diagram_label RPC-payload guards, hoisted out of load-session-questions.ts to
// keep that file under the 200-line cap (code-style.md §1) — the geometry-bounds
// check added a 3rd concern to an already-at-cap file. No 'use server' pragma:
// these are pure narrowing helpers, mirroring the schema/helpers split elsewhere
// in this feature (check-non-mc-answer-dispatch.ts).
import { MAX_LABELS, MAX_ZONES } from '@/app/app/quiz/actions/diagram-validation'

type DiagramZoneRow = { id: string; x: number; y: number; w: number; h: number }
type DiagramLabelRow = { id: string; text: string }
export type DiagramConfigRow = {
  image_ref: string
  zones: DiagramZoneRow[]
  labels: DiagramLabelRow[]
}

function isDiagramZone(value: unknown): value is DiagramZoneRow {
  if (typeof value !== 'object' || value === null) return false
  const { id, x, y, w, h } = value as Record<string, unknown>
  // Number.isFinite (not typeof === 'number') rejects NaN/Infinity — fail-closed,
  // mirroring the guard style used in load-session-questions.ts (isOrderingItem).
  if (
    typeof id !== 'string' ||
    id.trim().length === 0 ||
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof w !== 'number' ||
    !Number.isFinite(w) ||
    typeof h !== 'number' ||
    !Number.isFinite(h)
  )
    return false
  // Geometry bounds — mirror the mig 150 is_valid_diagram_config CHECK so a zone
  // that slips past the DB (RPC drift) can't render off-canvas: x/y in [0,1],
  // w/h in (0,1], and the box stays inside the unit canvas.
  return (
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1 &&
    w > 0 &&
    w <= 1 &&
    h > 0 &&
    h <= 1 &&
    x + w <= 1 &&
    y + h <= 1
  )
}

function isDiagramLabel(value: unknown): value is DiagramLabelRow {
  if (typeof value !== 'object' || value === null) return false
  const { id, text } = value as Record<string, unknown>
  return (
    typeof id === 'string' &&
    id.trim().length > 0 &&
    typeof text === 'string' &&
    text.trim().length > 0
  )
}

// Element + bounds guard for the diagram_config_public RPC payload (parity with
// isOrderingItemArray in load-session-questions.ts, code-style §5 cast-guard
// rule). The DB CHECK (mig 150, is_valid_diagram_config) enforces the same shape
// server-side — this is defense-in-depth against RPC drift.
export function isDiagramConfig(value: unknown): value is DiagramConfigRow {
  if (typeof value !== 'object' || value === null) return false
  const { image_ref, zones, labels } = value as Record<string, unknown>
  if (typeof image_ref !== 'string' || image_ref.trim().length === 0) return false
  if (!Array.isArray(zones) || zones.length === 0 || zones.length > MAX_ZONES) return false
  if (!zones.every(isDiagramZone)) return false
  if (new Set(zones.map((z) => (z as { id: string }).id)).size !== zones.length) return false
  if (!Array.isArray(labels) || labels.length === 0 || labels.length > MAX_LABELS) return false
  if (!labels.every(isDiagramLabel)) return false
  if (new Set(labels.map((l) => (l as { id: string }).id)).size !== labels.length) return false
  return true
}

// Reconstruct from ONLY the validated fields. A `value is T` predicate asserts
// shape but does NOT strip extra properties, so a future RPC regression that
// leaked an extra key (e.g. an answer hint on a zone/label) would otherwise pass
// straight through to the student. Rebuilding is the real "defense-in-depth
// against RPC drift" the isDiagramConfig comment promises.
export function toDiagramConfigRow(value: DiagramConfigRow): DiagramConfigRow {
  return {
    image_ref: value.image_ref,
    zones: value.zones.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
    labels: value.labels.map(({ id, text }) => ({ id, text })),
  }
}
