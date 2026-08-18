import { describe, expect, it } from 'vitest'
import {
  baseCenter,
  crosswindCenter,
  downwindCenter,
  finalCenter,
  RWY_2709_IMAGE_REF,
  RWY_2709_LABELS,
  RWY_2709_ZONES,
  upwindCenter,
} from './rwy-2709-layout'

const CORRECT_LABEL_TEXTS = [
  'Upwind leg',
  'Crosswind turn',
  'Crosswind leg',
  'Downwind turn',
  'Downwind leg',
  'Base turn',
  'Base leg',
  'Final turn',
  'Final approach',
]

describe('RWY_2709_IMAGE_REF', () => {
  it('is a non-empty logical key', () => {
    expect(RWY_2709_IMAGE_REF.length).toBeGreaterThan(0)
  })
})

describe('RWY_2709_ZONES', () => {
  it('has exactly 9 zones (5 legs + 4 turns)', () => {
    expect(RWY_2709_ZONES).toHaveLength(9)
  })

  it('keeps every zone box fully within the [0,1] coordinate space', () => {
    for (const zone of RWY_2709_ZONES) {
      expect(zone.x).toBeGreaterThanOrEqual(0)
      expect(zone.y).toBeGreaterThanOrEqual(0)
      expect(zone.x + zone.w).toBeLessThanOrEqual(1)
      expect(zone.y + zone.h).toBeLessThanOrEqual(1)
      expect(zone.w).toBeGreaterThan(0)
      expect(zone.h).toBeGreaterThan(0)
    }
  })

  it('has 9 distinct, non-blank zone ids', () => {
    const ids = RWY_2709_ZONES.map((z) => z.id)
    expect(new Set(ids).size).toBe(9)
    for (const id of ids) expect(id.trim().length).toBeGreaterThan(0)
  })

  it('does not overlap zone boxes', () => {
    // Pairwise AABB overlap check — a real overlap would mean two drop targets
    // fight for the same pointer input on screen.
    for (const [i, a] of RWY_2709_ZONES.entries()) {
      for (const b of RWY_2709_ZONES.slice(i + 1)) {
        const overlapsX = a.x < b.x + b.w && b.x < a.x + a.w
        const overlapsY = a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlapsX && overlapsY).toBe(false)
      }
    }
  })
})

describe('exported leg centers stay in sync with their drop zones', () => {
  it('places each leg center at the center of its corresponding leg zone box', () => {
    // The artwork's direction arrows (rwy-2709-lh-pattern.tsx) and the drop-zone
    // boxes are both derived from these leg centers — so a leg center must sit at
    // the center of its zone box, or the arrow and drop target would drift apart.
    const legCenterByZoneIndex: ReadonlyArray<readonly [number, { x: number; y: number }]> = [
      [0, upwindCenter], // upwind leg
      [2, crosswindCenter], // crosswind leg
      [4, downwindCenter], // downwind leg
      [6, baseCenter], // base leg
      [8, finalCenter], // final leg
    ]
    for (const [index, center] of legCenterByZoneIndex) {
      const zone = RWY_2709_ZONES[index]
      expect(zone).toBeDefined()
      if (!zone) continue
      expect(center.x).toBeCloseTo(zone.x + zone.w / 2)
      expect(center.y).toBeCloseTo(zone.y + zone.h / 2)
    }
  })
})

describe('RWY_2709_LABELS', () => {
  it('includes all 9 correct leg/turn labels plus at least 2 distractors', () => {
    const texts = RWY_2709_LABELS.map((l) => l.text)
    for (const text of CORRECT_LABEL_TEXTS) expect(texts).toContain(text)
    expect(RWY_2709_LABELS.length).toBeGreaterThanOrEqual(CORRECT_LABEL_TEXTS.length + 2)
  })

  it('lists the 9 correct labels in flight order, ahead of the distractors', () => {
    // LOAD-BEARING, not cosmetic. The seeded diagram answer key is built by zipping
    // RWY_2709_ZONES[i] with RWY_2709_LABELS[i] for i < 9 (buildRwy2709Answer in
    // scripts/seed-vfr-rt-training-eval.ts), so this array's ORDER is the key. Alphabetise these
    // labels, or hoist a distractor to the top, and the key silently becomes upwind leg ->
    // Go-around: a valid bijection that passes the DB CHECK, passes assertDiagramConfig (which
    // validates structure and derivation, never semantics), and passes the derived-id pin
    // (ids travel with their text). It would surface only as a question nobody can answer.
    expect(RWY_2709_LABELS.slice(0, CORRECT_LABEL_TEXTS.length).map((l) => l.text)).toEqual(
      CORRECT_LABEL_TEXTS,
    )
  })

  it('has distinct, non-blank label ids', () => {
    const ids = RWY_2709_LABELS.map((l) => l.id)
    expect(new Set(ids).size).toBe(RWY_2709_LABELS.length)
    for (const id of ids) expect(id.trim().length).toBeGreaterThan(0)
  })
})

describe('zone and label ids (answer-oracle invariant)', () => {
  it('shares no id between the zone set and the label set', () => {
    const zoneIds = new Set(RWY_2709_ZONES.map((z) => z.id))
    const labelIds = new Set(RWY_2709_LABELS.map((l) => l.id))
    const intersection = [...zoneIds].filter((id) => labelIds.has(id))
    expect(intersection).toEqual([])
  })

  it('identifies every zone and label by a fixed-width digest and nothing else', () => {
    // A derived id is a kind prefix, a scheme-version digit, and 8 hex characters
    // of a SHA-256 — no author-chosen part survives in which the zone -> label
    // pairing could be encoded. This shape check is what goes red if a hand-written
    // id such as `z_upwind_1` (or the old `lk3f81a` family) is reintroduced. The
    // exact values are pinned against the derivation itself in
    // apps/web/scripts/diagram-content.test.ts; this file only sees the format.
    const zoneIds = RWY_2709_ZONES.map((z) => z.id)
    const labelIds = RWY_2709_LABELS.map((l) => l.id)
    for (const id of zoneIds) expect(id).toMatch(/^z1[0-9a-f]{8}$/)
    for (const id of labelIds) expect(id).toMatch(/^l1[0-9a-f]{8}$/)
    // Every id is the same width, so none has spare room the others lack.
    expect(new Set([...zoneIds, ...labelIds].map((id) => id.length))).toEqual(new Set([10]))
  })
})
