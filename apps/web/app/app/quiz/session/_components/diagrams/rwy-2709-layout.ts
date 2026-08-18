// Canonical layout for the RWY 27/09 left-hand traffic pattern `diagram_label`
// question. Single source of truth for the zone positions: the SVG artwork
// (`rwy-2709-lh-pattern.tsx`) and the seed script that builds the DB
// `diagram_config` both import this module, so the artwork and the delivered
// drop-zone coordinates can never drift apart.
//
// SECURITY (VFR RT Phase 6 diagram_label answer-oracle invariant — see
// `.spec-workflow/specs/vfr-rt-training/phase6-plan.md` and docs/security.md):
// every zone and label id below is DERIVED from content, never chosen by an
// author. A zone id is `deriveZoneId(RWY_2709_IMAGE_REF, <its array index>)`
// and a label id is `deriveLabelId(<its own text>)` — both from
// `apps/web/scripts/diagram-content.ts`, which builds a `z`/`l` prefix plus a
// scheme-version digit plus the first 8 hex characters of the SHA-256 of the
// normalized inputs. That module is also the gate every authored/seeded config
// must pass: `assertDiagramConfig` re-derives each id and rejects any that was
// written by hand.
//
// The ids are LITERALS here rather than computed at runtime because this
// module is pulled into the CLIENT bundle — the `'use client'` component
// `diagram-label-input.tsx` imports `registry.ts`, which imports this file —
// and the derivation needs `node:crypto`, which is absent in the browser. The
// literals are PINNED by a test — `apps/web/scripts/diagram-content.test.ts`
// re-derives every id from this module and fails, printing the expected value,
// if a literal ever drifts from the image ref, the index, or the label text.
//
// WHY derivation closes the oracle: the student receives the zones in stored
// order and the labels shuffled, but never the zone -> label mapping — it is
// held in the seeded `questions.diagram_config.answer` array and stripped
// server-side before delivery (see `get_quiz_questions()`). Read the SECURITY
// note on `RWY_2709_LABELS` below before trusting that sentence: the seeded
// row is not the ONLY place the pairing exists — the seed builds it by zipping
// the two arrays in this file by index, so their shared order encodes it too.
//
// An id the author picks is a free variable delivered right beside the content
// it names, so the mapping can be encoded into it, deliberately (`z_correct_1`)
// or by accident.
// Derivation removes the free variable: a zone id depends only on which image
// and which position, a label id only on what the chip says, so neither can be
// made to depend on the other and no assignment of ids can carry the pairing.
//
// HISTORICAL DEFECT — do not reintroduce hand-picked ids. The 12 label ids
// were once hand-written `lk…`, `lm…`, `lp…`, `lq…`, `lr…` …: strictly
// ascending second characters in canonical order, with the 3 distractors last.
// Sorting the shuffled chips by id therefore restored canonical order, so
// `labels.sort(byId).slice(0, 9)` zipped index-wise against the in-order zones
// rebuilt all 9 correct pairs out of the delivered payload alone. Every id was
// individually "opaque"; the leak was in their relative ORDER, which is
// exactly what an author cannot control once the id is a hash of the content.

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

const ZONE_W = 0.15
const ZONE_H = 0.08

function midpoint(a: PatternPoint, b: PatternPoint): PatternPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function box(id: string, center: PatternPoint): DiagramZone {
  return { id, x: center.x - ZONE_W / 2, y: center.y - ZONE_H / 2, w: ZONE_W, h: ZONE_H }
}

const [crosswindTurn, downwindTurn, baseTurn, finalTurn] = RWY_2709_PATH_POINTS
export const runwayWest = { x: RWY_2709_RUNWAY.xThreshold09, y: RWY_2709_RUNWAY.y }
export const runwayEast = { x: RWY_2709_RUNWAY.xThreshold27, y: RWY_2709_RUNWAY.y }
export const upwindCenter = midpoint(runwayWest, crosswindTurn)
export const crosswindCenter = midpoint(crosswindTurn, downwindTurn)
export const downwindCenter = midpoint(downwindTurn, baseTurn)
export const baseCenter = midpoint(baseTurn, finalTurn)
export const finalCenter = midpoint(finalTurn, runwayEast)

/**
 * The 9 drop zones (5 legs + 4 turns), positioned along the circuit above, in
 * flight order. Each id is `deriveZoneId(RWY_2709_IMAGE_REF, <its index>)`, so
 * it says only WHERE the zone is on WHICH image — see the SECURITY note at the
 * top of this file. Reordering this array does NOT change the literal ids — they are literals.
 * It makes them WRONG: each id is derived from its INDEX, so a reorder breaks the derivation
 * pin in diagram-content.test.ts and invalidates every stored answer mapping keyed on the old
 * positions. Re-derive the ids and re-seed if you reorder.
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
 * The draggable chip pool: the 9 correct leg/turn labels plus a few plausible
 * distractors. Each id is `deriveLabelId(<its own text>)`, so it carries
 * nothing the delivered chip text does not already say and cannot hint at the
 * zone it answers — see the SECURITY note at the top of this file. Editing a
 * `text` here means re-deriving its `id`; the pin test names the new value.
 * The correct zone <-> label pairing is never DELIVERED — `get_quiz_questions()`
 * strips `diagram_config.answer` and shuffles these chips. But it is a mistake to
 * read that as "the pairing exists only in the seeded row": `buildRwy2709Answer()`
 * in scripts/seed-vfr-rt-training-eval.ts BUILDS that seeded key by zipping
 * `RWY_2709_ZONES[i]` with `RWY_2709_LABELS[i]`, so the pairing also lives,
 * implicitly, in the shared index order of these two arrays — in this file.
 *
 * What actually reaches the client bundle is ASYMMETRIC, and the asymmetry is
 * load-bearing. Measured against a fresh `pnpm --filter @repo/web build` of this
 * commit's source: all 9 zone ids ARE in a client chunk, minified to `rt("z1a077e7d6",ro)`
 * — the `box(...)` initializers below are CALL expressions, which the bundler
 * cannot prove side-effect-free, so the calls and their string arguments survive
 * dead-code elimination even though the array binding itself is dropped. No label
 * id and no label TEXT appears anywhere in `.next/static`.
 *
 * Shipping the zone ids is harmless: `get_quiz_questions()` delivers exactly those
 * ids to the student anyway. The key is the PAIRING, and recovering it needs the
 * label order — so what protects it is that `RWY_2709_LABELS` is eliminated.
 *
 * ⚠️ TWO guards keep it that way, and neither is enforced by any lint rule:
 *   1. NEVER import `RWY_2709_LABELS` (or `RWY_2709_ZONES`) from a `'use client'`
 *      subtree. Nothing does today — `registry.ts`, `diagram-refs.ts` and the two
 *      artwork components take only `RWY_2709_IMAGE_REF` and the geometry consts,
 *      so neither array has any NON-TEST importer under `app/`. (The co-located
 *      `rwy-2709-layout.test.ts` does import both, which is fine — test files are
 *      not in the Next build; the Node-side scripts import them too.) One client preview,
 *      admin editor or debug overlay importing the labels ships all 12 chips in
 *      canonical order, and the zone ids are already delivered: the complete key.
 *   2. KEEP `RWY_2709_LABELS` A PLAIN OBJECT-LITERAL ARRAY. It is droppable only
 *      because it is bare `{ id, text }` literals. Wrapping them in a helper —
 *      `chip('Upwind leg')`, mirroring `box()` above — would ship all 12 texts in
 *      canonical order with NO import change at all, invisible to guard 1. That
 *      last sentence is INFERENCE, not measurement: it follows from the zones
 *      above, which demonstrate the identical mechanism with a real build.
 *
 * The order-pin test in rwy-2709-layout.test.ts guards the array ORDER; these two
 * rules guard its REACHABILITY. Re-measure with a real build before restating any
 * claim here — an earlier DRAFT of this comment (never committed, so `git log -p`
 * will not show it) asserted both arrays were tree-shaken, which was false for the
 * zones and had been carried over from a report rather than re-derived
 * (code-style.md §10).
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
