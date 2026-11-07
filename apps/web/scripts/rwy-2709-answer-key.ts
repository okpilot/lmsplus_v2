// RWY 27/09 answer key: `RWY_2709_ZONES[i]` pairs with `RWY_2709_LABELS[i]` for i < 9.
// Server/script-side only. The import boundary is the Biome `noRestrictedImports` override in
// biome.json (#1218): apps/web and packages code outside scripts, e2e and tests may not import
// `**/scripts/**`.
//
// Every id is DERIVED (docs/security.md, diagram_label answer-oracle invariant): a zone id is
// `deriveZoneId(RWY_2709_IMAGE_REF, <index>)`, a label id is `deriveLabelId(<text>)`
// (scripts/diagram-content.ts). The ids are literals, pinned by scripts/diagram-content.test.ts.

import type {
  DiagramLabel,
  DiagramZone,
} from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'
import {
  baseCenter,
  crosswindCenter,
  downwindCenter,
  finalCenter,
  RWY_2709_PATH_POINTS,
  upwindCenter,
} from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'

const ZONE_W = 0.15
const ZONE_H = 0.08

function box(id: string, center: { x: number; y: number }): DiagramZone {
  return { id, x: center.x - ZONE_W / 2, y: center.y - ZONE_H / 2, w: ZONE_W, h: ZONE_H }
}

const [crosswindTurn, downwindTurn, baseTurn, finalTurn] = RWY_2709_PATH_POINTS

/**
 * The 9 drop zones (5 legs + 4 turns) in flight order. Each id is derived from its INDEX:
 * reordering breaks the pin in diagram-content.test.ts and invalidates stored answer mappings.
 * Re-derive the ids and re-seed if you reorder.
 */
export const RWY_2709_ZONES: DiagramZone[] = [
  box('z1a077e7d6', upwindCenter), // upwind leg
  box('z15e35c6a0', crosswindTurn), // crosswind turn
  box('z1bccb7012', crosswindCenter), // crosswind leg
  box('z1338f3427', downwindTurn), // downwind turn
  box('z1f52cd849', downwindCenter), // downwind leg
  box('z18b88fc20', baseTurn), // base turn
  box('z1f30f0098', baseCenter), // base leg
  box('z1ea0f74cb', finalTurn), // final turn
  box('z150e9e363', finalCenter), // final leg
]

/**
 * The chip pool: the 9 correct labels in flight order, then 3 distractors. Each id is
 * `deriveLabelId(<its text>)`; editing a `text` means re-deriving its id (the pin test names it).
 * ORDER is the key: `buildRwy2709Answer()` (seed-vfr-rt-training-eval.ts) zips this array with
 * `RWY_2709_ZONES` by index.
 */
export const RWY_2709_LABELS: DiagramLabel[] = [
  { id: 'l1e13b0b8a', text: 'Upwind leg' },
  { id: 'l11f511ea8', text: 'Crosswind turn' },
  { id: 'l14b756e39', text: 'Crosswind leg' },
  { id: 'l122798fc8', text: 'Downwind turn' },
  { id: 'l128b13785', text: 'Downwind leg' },
  { id: 'l1379f4707', text: 'Base turn' },
  { id: 'l1b0cfc698', text: 'Base leg' },
  { id: 'l18bcaa982', text: 'Final turn' },
  { id: 'l169114887', text: 'Final approach' },
  { id: 'l167549160', text: 'Go-around' }, // distractor
  { id: 'l1a70712f4', text: 'Departure' }, // distractor
  { id: 'l1497e22fe', text: 'Threshold' }, // distractor
]
