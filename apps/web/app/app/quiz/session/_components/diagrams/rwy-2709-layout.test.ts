import { describe, expect, it } from 'vitest'
import { RWY_2709_IMAGE_REF, RWY_2709_LABELS, RWY_2709_ZONES } from './rwy-2709-layout'

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

describe('RWY_2709_LABELS', () => {
  it('includes all 9 correct leg/turn labels plus at least 2 distractors', () => {
    const texts = RWY_2709_LABELS.map((l) => l.text)
    for (const text of CORRECT_LABEL_TEXTS) expect(texts).toContain(text)
    expect(RWY_2709_LABELS.length).toBeGreaterThanOrEqual(CORRECT_LABEL_TEXTS.length + 2)
  })

  it('has distinct, non-blank label ids', () => {
    const ids = RWY_2709_LABELS.map((l) => l.id)
    expect(new Set(ids).size).toBe(RWY_2709_LABELS.length)
    for (const id of ids) expect(id.trim().length).toBeGreaterThan(0)
  })
})

describe('zone/label id disjointness (answer-oracle invariant)', () => {
  it('shares no id between the zone set and the label set', () => {
    const zoneIds = new Set(RWY_2709_ZONES.map((z) => z.id))
    const labelIds = new Set(RWY_2709_LABELS.map((l) => l.id))
    const intersection = [...zoneIds].filter((id) => labelIds.has(id))
    expect(intersection).toEqual([])
  })

  it('uses unrelated id schemes — no zone id textually matches its own leg/turn name', () => {
    // A parallel-naming leak would look like a zone id containing the same word as
    // its intended correct label (e.g. zone id "upwind-1"). Check the DISTINCTIVE
    // words of each label — not the whole normalized phrase — so a per-word leak
    // like "upwind-1" is caught (the phrase "upwind leg" → "upwindleg" would miss
    // it). Generic words shared by every leg ("leg", "turn", "approach") carry no
    // answer signal, so they're excluded.
    const genericWords = new Set(['leg', 'turn', 'approach'])
    const leakedAnswerWords = CORRECT_LABEL_TEXTS.flatMap((text) =>
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => !genericWords.has(word)),
    )
    for (const zone of RWY_2709_ZONES) {
      const lowerId = zone.id.toLowerCase()
      for (const word of leakedAnswerWords) {
        expect(lowerId.includes(word)).toBe(false)
      }
    }
  })
})
