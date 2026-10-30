import { describe, expect, it } from 'vitest'
import { tapLabel, tapPool, tapRow } from './diagram-tap-state'

const empty = { placement: new Map<string, string>(), armed: null }

describe('diagram tap state', () => {
  it('tapping a pool label arms it, tapping again disarms', () => {
    const a = tapLabel(empty, 'l1')
    expect(a.armed).toEqual({ kind: 'label', id: 'l1' })
    expect(tapLabel(a, 'l1').armed).toBeNull()
  })

  it('armed label + row places it', () => {
    const s = tapRow(tapLabel(empty, 'l1'), 'z1')
    expect(s.placement.get('z1')).toBe('l1')
    expect(s.armed).toBeNull()
  })

  it('row first arms the zone, then a label places it', () => {
    const a = tapRow(empty, 'z1')
    expect(a.armed).toEqual({ kind: 'zone', id: 'z1' })
    expect(tapLabel(a, 'l2').placement.get('z1')).toBe('l2')
  })

  it('placed row arms its chip; tapping another row moves it', () => {
    const placed = { placement: new Map([['z1', 'l1']]), armed: null }
    const armed = tapRow(placed, 'z1')
    expect(armed.armed).toEqual({ kind: 'label', id: 'l1' })
    const moved = tapRow(armed, 'z2')
    expect([...moved.placement]).toEqual([['z2', 'l1']])
  })

  it('pool background unplaces an armed placed label', () => {
    const armed = tapRow({ placement: new Map([['z1', 'l1']]), armed: null }, 'z1')
    expect(tapPool(armed).placement.size).toBe(0)
  })

  it('pool background only disarms an armed pool label', () => {
    const s = tapPool(tapLabel(empty, 'l1'))
    expect(s.armed).toBeNull()
    expect(s.placement.size).toBe(0)
  })
})
