// Canonical layout for the RWY 27/09 left-hand traffic pattern `diagram_label`
// question. Single source of truth for the zone positions: the SVG artwork
// (`rwy-2709-lh-pattern.tsx`) and the seed script that builds the DB
// `diagram_config` both import this module, so the artwork and the delivered
// drop-zone coordinates can never drift apart.
//
// SECURITY (VFR RT Phase 6 diagram_label answer-oracle invariant — see
// `.spec-workflow/specs/vfr-rt-training/phase6-plan.md` and docs/security.md):
// zone ids and label ids are OPAQUE, hand-written, and use UNRELATED
// random-looking schemes. No zone id equals any label id, and there is no
// parallel naming that reveals which label pairs with which zone (the
// "upwind" zone is NOT id/text "upwind" — see the per-zone comments below,
// which describe VISUAL position only, self-evident from the artwork, never
// the answer). The correct zone -> label mapping is never stored here, or in
// any frontend file — only in the seeded `questions.diagram_config.answer`
// array, stripped server-side before delivery (see `get_quiz_questions()`).

export type DiagramZone = { id: string; x: number; y: number; w: number; h: number }
export type DiagramLabel = { id: string; text: string }
export type PatternPoint = { x: number; y: number }

/** Logical image_ref key — the public, non-secret lookup key into the SVG registry. */
export const RWY_2709_IMAGE_REF = 'rwy-2709-lh-pattern'

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

const ZONE_W = 0.15
const ZONE_H = 0.08

function midpoint(a: PatternPoint, b: PatternPoint): PatternPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function box(id: string, center: PatternPoint): DiagramZone {
  return { id, x: center.x - ZONE_W / 2, y: center.y - ZONE_H / 2, w: ZONE_W, h: ZONE_H }
}

const [crosswindTurn, downwindTurn, baseTurn, finalTurn] = RWY_2709_PATH_POINTS
const runwayWest = { x: RWY_2709_RUNWAY.xThreshold09, y: RWY_2709_RUNWAY.y }
const runwayEast = { x: RWY_2709_RUNWAY.xThreshold27, y: RWY_2709_RUNWAY.y }
const upwindCenter = midpoint(runwayWest, crosswindTurn)
const crosswindCenter = midpoint(crosswindTurn, downwindTurn)
const downwindCenter = midpoint(downwindTurn, baseTurn)
const baseCenter = midpoint(baseTurn, finalTurn)
const finalCenter = midpoint(finalTurn, runwayEast)

/**
 * The 9 drop zones (5 legs + 4 turns), positioned along the circuit above, in
 * flight order. Ids are opaque and unrelated to any label id — see the
 * SECURITY note at the top of this file.
 */
export const RWY_2709_ZONES: DiagramZone[] = [
  box('z9f2a1c', upwindCenter), // upwind leg
  box('zb84e7d', crosswindTurn), // crosswind turn
  box('z3c1908', crosswindCenter), // crosswind leg
  box('ze52af6', downwindTurn), // downwind turn
  box('z71bd3a', downwindCenter), // downwind leg
  box('zd0946f', baseTurn), // base turn
  box('z2e6c81', baseCenter), // base leg
  box('za47b02', finalTurn), // final turn
  box('zc19d5e', finalCenter), // final leg
]

/**
 * The draggable chip pool: the 9 correct leg/turn labels plus a few plausible
 * distractors. Label ids are opaque and use an UNRELATED scheme from zone ids
 * — see the SECURITY note at the top of this file. The correct zone <-> label
 * pairing is intentionally NOT encoded anywhere in this module.
 */
export const RWY_2709_LABELS: DiagramLabel[] = [
  { id: 'lk3f81a', text: 'Upwind leg' },
  { id: 'lm70cd2', text: 'Crosswind turn' },
  { id: 'lp9e64b', text: 'Crosswind leg' },
  { id: 'lq2a17f', text: 'Downwind turn' },
  { id: 'lr58c93', text: 'Downwind leg' },
  { id: 'ls6b4e0', text: 'Base turn' },
  { id: 'lt3d829', text: 'Base leg' },
  { id: 'lu91f5c', text: 'Final turn' },
  { id: 'lv7a26d', text: 'Final approach' },
  { id: 'lw4c018', text: 'Go-around' }, // distractor
  { id: 'lx82b7e', text: 'Departure' }, // distractor
  { id: 'ly5f39a', text: 'Threshold' }, // distractor
]
