import { describe, expect, it } from 'vitest'
import {
  allPlacementsCorrect,
  DIAGRAM_POOL_DROPPABLE_ID,
  type DiagramLabelChipData,
  type DiagramMapping,
  type DiagramZoneData,
  hasAnyPlacement,
  placeLabel,
  placementFromSubmitted,
  poolLabels,
  serializeMapping,
  unplaceLabel,
  zoneResult,
} from './diagram-label-input-helpers'

const ZONES: DiagramZoneData[] = [
  { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1 },
  { id: 'z2', x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
]

const LABELS: DiagramLabelChipData[] = [
  { id: 'l1', text: 'Upwind' },
  { id: 'l2', text: 'Downwind' },
  { id: 'l3', text: 'Distractor' },
]

describe('DIAGRAM_POOL_DROPPABLE_ID', () => {
  it('is a stable, non-empty droppable id distinct from any real zone id', () => {
    expect(DIAGRAM_POOL_DROPPABLE_ID.length).toBeGreaterThan(0)
    expect(ZONES.some((z) => z.id === DIAGRAM_POOL_DROPPABLE_ID)).toBe(false)
  })
})

describe('placeLabel', () => {
  it('places a label into an empty zone', () => {
    const result = placeLabel(new Map(), 'z1', 'l1')
    expect(result.get('z1')).toBe('l1')
  })

  it('moves a placed label to a new zone, vacating the old zone', () => {
    const start = new Map([['z1', 'l1']])
    const result = placeLabel(start, 'z2', 'l1')
    expect(result.get('z1')).toBeUndefined()
    expect(result.get('z2')).toBe('l1')
  })

  it('replaces the occupant of a zone, implicitly returning it to the pool', () => {
    const start = new Map([['z1', 'l1']])
    const result = placeLabel(start, 'z1', 'l2')
    expect(result.get('z1')).toBe('l2')
    // l1 is no longer a value anywhere in the map — it is back in the pool.
    expect(Array.from(result.values())).not.toContain('l1')
  })

  it('does not mutate the input map', () => {
    const start = new Map([['z1', 'l1']])
    placeLabel(start, 'z2', 'l2')
    expect(start.size).toBe(1)
  })
})

describe('unplaceLabel', () => {
  it('removes a label from its zone', () => {
    const start = new Map([['z1', 'l1']])
    const result = unplaceLabel(start, 'l1')
    expect(result.has('z1')).toBe(false)
  })

  it('is a no-op when the label is not currently placed', () => {
    const start = new Map([['z1', 'l1']])
    const result = unplaceLabel(start, 'l2')
    expect(result).toEqual(start)
  })
})

describe('poolLabels', () => {
  it('returns every label when nothing is placed', () => {
    expect(poolLabels(LABELS, new Map())).toEqual(LABELS)
  })

  it('excludes labels currently placed in a zone', () => {
    const placement = new Map([['z1', 'l1']])
    const pool = poolLabels(LABELS, placement)
    expect(pool.map((l) => l.id)).toEqual(['l2', 'l3'])
  })

  it('returns an empty pool once every label is placed', () => {
    const placement = new Map([
      ['z1', 'l1'],
      ['z2', 'l2'],
    ])
    // l3 remains in the pool — distractors are never forced into a zone.
    expect(poolLabels(LABELS, placement).map((l) => l.id)).toEqual(['l3'])
  })

  it('returns a fully empty array when every label, including distractors, is placed', () => {
    // Distinct from the case above: only a truly empty result array proves the
    // "All labels placed" empty-pool message renders — a residual distractor
    // would leave a non-empty array that looks superficially similar.
    const placement = new Map(LABELS.map((l, i) => [`z${i}`, l.id]))
    expect(poolLabels(LABELS, placement)).toEqual([])
  })
})

describe('serializeMapping', () => {
  it('serializes an empty placement to an empty array', () => {
    expect(serializeMapping(new Map())).toEqual([])
  })

  it('serializes each entry to a {zoneId, labelId} pair', () => {
    const placement = new Map([
      ['z1', 'l1'],
      ['z2', 'l2'],
    ])
    expect(serializeMapping(placement)).toEqual([
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z2', labelId: 'l2' },
    ])
  })
})

describe('hasAnyPlacement', () => {
  it('is false for an empty placement', () => {
    expect(hasAnyPlacement(new Map())).toBe(false)
  })

  it('is true once at least one zone is filled', () => {
    expect(hasAnyPlacement(new Map([['z1', 'l1']]))).toBe(true)
  })
})

describe('placementFromSubmitted', () => {
  it('starts empty when the answer is not yet submitted', () => {
    const result = placementFromSubmitted(ZONES, LABELS, false, [{ zoneId: 'z1', labelId: 'l1' }])
    expect(result.size).toBe(0)
  })

  it('starts empty when there is no submitted mapping', () => {
    expect(placementFromSubmitted(ZONES, LABELS, true, undefined).size).toBe(0)
  })

  it('starts empty when the submitted mapping is an empty array', () => {
    expect(placementFromSubmitted(ZONES, LABELS, true, []).size).toBe(0)
  })

  it('restores the student submitted placement by zone/label id', () => {
    const submitted: DiagramMapping[] = [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z2', labelId: 'l2' },
    ]
    const result = placementFromSubmitted(ZONES, LABELS, true, submitted)
    expect(result.get('z1')).toBe('l1')
    expect(result.get('z2')).toBe('l2')
  })

  it('restores a partial placement (not every zone filled)', () => {
    const result = placementFromSubmitted(ZONES, LABELS, true, [{ zoneId: 'z1', labelId: 'l1' }])
    expect(result.size).toBe(1)
    expect(result.get('z1')).toBe('l1')
  })

  it('falls back to empty when a submitted entry references an unknown zone id', () => {
    const result = placementFromSubmitted(ZONES, LABELS, true, [
      { zoneId: 'not-a-real-zone', labelId: 'l1' },
    ])
    expect(result.size).toBe(0)
  })

  it('falls back to empty when a submitted entry references an unknown label id', () => {
    const result = placementFromSubmitted(ZONES, LABELS, true, [
      { zoneId: 'z1', labelId: 'not-a-real-label' },
    ])
    expect(result.size).toBe(0)
  })

  it('falls back to empty when the submitted mapping reuses the same zone twice', () => {
    // Not a valid injective mapping — isDiagramMappingArray rejects duplicate zoneIds.
    const result = placementFromSubmitted(ZONES, LABELS, true, [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z1', labelId: 'l2' },
    ])
    expect(result.size).toBe(0)
  })

  it('falls back to empty when the submitted mapping reuses the same label twice', () => {
    const result = placementFromSubmitted(ZONES, LABELS, true, [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z2', labelId: 'l1' },
    ])
    expect(result.size).toBe(0)
  })
})

describe('zoneResult', () => {
  const CORRECT: DiagramMapping[] = [
    { zoneId: 'z1', labelId: 'l1' },
    { zoneId: 'z2', labelId: 'l2' },
  ]

  it('is undefined before grading data arrives', () => {
    expect(zoneResult('z1', new Map([['z1', 'l1']]), undefined)).toBeUndefined()
  })

  it('marks a zone correct when the placed label matches the canonical label', () => {
    const placement = new Map([['z1', 'l1']])
    expect(zoneResult('z1', placement, CORRECT)).toBe('correct')
  })

  it('marks a zone incorrect when the placed label does not match', () => {
    const placement = new Map([['z1', 'l2']])
    expect(zoneResult('z1', placement, CORRECT)).toBe('incorrect')
  })

  it('marks an unplaced zone incorrect once graded', () => {
    expect(zoneResult('z1', new Map(), CORRECT)).toBe('incorrect')
  })
})

describe('allPlacementsCorrect', () => {
  const CORRECT: DiagramMapping[] = [
    { zoneId: 'z1', labelId: 'l1' },
    { zoneId: 'z2', labelId: 'l2' },
  ]

  it('is true when every canonical zone is placed with its correct label', () => {
    const placement = new Map([
      ['z1', 'l1'],
      ['z2', 'l2'],
    ])
    expect(allPlacementsCorrect(placement, CORRECT)).toBe(true)
  })

  it('is false when a zone is missing from the placement', () => {
    const placement = new Map([['z1', 'l1']])
    expect(allPlacementsCorrect(placement, CORRECT)).toBe(false)
  })

  it('is false when a zone holds the wrong label', () => {
    const placement = new Map([
      ['z1', 'l1'],
      ['z2', 'l1'],
    ])
    expect(allPlacementsCorrect(placement, CORRECT)).toBe(false)
  })
})
