import { describe, expect, it } from 'vitest'
import { MAX_LABELS, MAX_ZONES } from '@/app/app/quiz/actions/diagram-validation'
import { isDiagramConfig, toDiagramConfigRow } from './load-session-diagram-guards'

function validConfig() {
  return {
    image_ref: 'rwy-27-09-lh-pattern',
    zones: [
      { id: 'z1', x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
      { id: 'z2', x: 0.6, y: 0.6, w: 0.1, h: 0.1 },
    ],
    labels: [
      { id: 'l1', text: 'Upwind leg' },
      { id: 'l2', text: 'Crosswind leg' },
    ],
  }
}

describe('isDiagramConfig', () => {
  it('accepts a well-formed delivered config', () => {
    expect(isDiagramConfig(validConfig())).toBe(true)
  })

  it('rejects a config with a blank image_ref', () => {
    expect(isDiagramConfig({ ...validConfig(), image_ref: '   ' })).toBe(false)
  })

  it('rejects a zone that overflows the unit canvas', () => {
    const c = validConfig()
    c.zones[0] = { id: 'z1', x: 0.95, y: 0.2, w: 0.2, h: 0.1 } // x + w = 1.15 > 1
    expect(isDiagramConfig(c)).toBe(false)
  })

  it('rejects a zone whose size is not strictly positive', () => {
    const c = validConfig()
    c.zones[0] = { id: 'z1', x: 0.2, y: 0.2, w: 0, h: 0.1 }
    expect(isDiagramConfig(c)).toBe(false)
  })

  it('rejects a zone coordinate that is not finite', () => {
    const c = validConfig()
    c.zones[0] = { id: 'z1', x: Number.NaN, y: 0.2, w: 0.1, h: 0.1 }
    expect(isDiagramConfig(c)).toBe(false)
  })

  it('rejects duplicate zone ids', () => {
    const c = validConfig()
    c.zones[1] = { id: 'z1', x: 0.6, y: 0.6, w: 0.1, h: 0.1 }
    expect(isDiagramConfig(c)).toBe(false)
  })

  it('rejects duplicate label ids', () => {
    const c = validConfig()
    c.labels[1] = { id: 'l1', text: 'Crosswind leg' }
    expect(isDiagramConfig(c)).toBe(false)
  })

  it('rejects more than MAX_ZONES zones', () => {
    const c = validConfig()
    c.zones = Array.from({ length: MAX_ZONES + 1 }, (_, i) => ({
      id: `z${i}`,
      x: 0,
      y: 0,
      w: 0.01,
      h: 0.01,
    }))
    expect(isDiagramConfig(c)).toBe(false)
  })

  it('rejects more than MAX_LABELS labels', () => {
    const c = validConfig()
    c.labels = Array.from({ length: MAX_LABELS + 1 }, (_, i) => ({
      id: `l${i}`,
      text: `Label ${i}`,
    }))
    expect(isDiagramConfig(c)).toBe(false)
  })

  it('accepts exactly MAX_ZONES zones', () => {
    const c = validConfig()
    c.zones = Array.from({ length: MAX_ZONES }, (_, i) => ({
      id: `z${i}`,
      x: 0,
      y: 0,
      w: 0.01,
      h: 0.01,
    }))
    expect(isDiagramConfig(c)).toBe(true)
  })

  it('accepts exactly MAX_LABELS labels', () => {
    const c = validConfig()
    c.labels = Array.from({ length: MAX_LABELS }, (_, i) => ({
      id: `l${i}`,
      text: `Label ${i}`,
    }))
    expect(isDiagramConfig(c)).toBe(true)
  })

  it('rejects a null or non-object value', () => {
    expect(isDiagramConfig(null)).toBe(false)
    expect(isDiagramConfig('nope')).toBe(false)
  })
})

describe('toDiagramConfigRow', () => {
  it('rebuilds from only the whitelisted fields, dropping any extra key', () => {
    const leaky = {
      image_ref: 'rwy-27-09-lh-pattern',
      zones: [{ id: 'z1', x: 0.2, y: 0.2, w: 0.1, h: 0.1, hint: 'l1' }],
      labels: [{ id: 'l1', text: 'Upwind leg', correct: true }],
    } as unknown as Parameters<typeof toDiagramConfigRow>[0]
    const row = toDiagramConfigRow(leaky)
    expect(row.zones[0]).toEqual({ id: 'z1', x: 0.2, y: 0.2, w: 0.1, h: 0.1 })
    expect(row.labels[0]).toEqual({ id: 'l1', text: 'Upwind leg' })
    expect('hint' in row.zones[0]!).toBe(false)
    expect('correct' in row.labels[0]!).toBe(false)
  })
})
