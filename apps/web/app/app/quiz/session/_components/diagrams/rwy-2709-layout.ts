// Canonical layout for the RWY 27/09 left-hand traffic pattern `diagram_label`
// question: image ref, viewBox, runway, circuit geometry. The SVG artwork
// (`rwy-2709-lh-pattern.tsx`) and the answer key (`scripts/rwy-2709-answer-key.ts`)
// both derive from it, so artwork and drop-zone coordinates cannot drift apart.
// This module reaches the client bundle: it holds geometry only, never the answer key.

export type DiagramZone = { id: string; x: number; y: number; w: number; h: number }
export type DiagramLabel = { id: string; text: string }
export type PatternPoint = { x: number; y: number }

/** Logical image_ref key — the public, non-secret lookup key into the SVG registry. */
export const RWY_2709_IMAGE_REF = 'rwy-2709-lh-pattern'

/** Shared SVG viewBox dimensions (landscape 16:9) — single source for every
 *  artwork piece that shares this coordinate space. */
export const RWY_2709_VBW = 160
export const RWY_2709_VBH = 90

/** Runway centerline, as fractions of the [0,1] artwork/zone coordinate space.
 *  The runway sits near the TOP of the canvas and the circuit hangs down from
 *  it, so the pattern fills the square artwork vertically (minimal whitespace). */
export const RWY_2709_RUNWAY = {
  xThreshold09: 0.4,
  xThreshold27: 0.6,
  y: 0.15,
  halfWidth: 0.024,
}

/**
 * The 4 corners of the rectangular left-hand circuit (fractions 0..1), in flight
 * order: crosswind-turn -> downwind-turn -> base-turn -> final-turn. Upwind and
 * final extend from the runway thresholds to the first/last corner along the
 * SAME extended centerline (y = RWY_2709_RUNWAY.y) — a real left-hand-pattern
 * property (all 4 turns verified left-turns via heading math), not a drawing
 * simplification.
 */
export const RWY_2709_PATH_POINTS: readonly [
  PatternPoint,
  PatternPoint,
  PatternPoint,
  PatternPoint,
] = [
  { x: 0.1, y: 0.15 }, // crosswind-turn corner (upwind end)
  { x: 0.1, y: 0.88 }, // downwind-turn corner (crosswind end)
  { x: 0.9, y: 0.88 }, // base-turn corner (downwind end)
  { x: 0.9, y: 0.15 }, // final-turn corner (base end)
]

function midpoint(a: PatternPoint, b: PatternPoint): PatternPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

const [crosswindTurn, downwindTurn, baseTurn, finalTurn] = RWY_2709_PATH_POINTS
export const runwayWest = { x: RWY_2709_RUNWAY.xThreshold09, y: RWY_2709_RUNWAY.y }
export const runwayEast = { x: RWY_2709_RUNWAY.xThreshold27, y: RWY_2709_RUNWAY.y }
export const upwindCenter = midpoint(runwayWest, crosswindTurn)
export const crosswindCenter = midpoint(crosswindTurn, downwindTurn)
export const downwindCenter = midpoint(downwindTurn, baseTurn)
export const baseCenter = midpoint(baseTurn, finalTurn)
export const finalCenter = midpoint(finalTurn, runwayEast)
