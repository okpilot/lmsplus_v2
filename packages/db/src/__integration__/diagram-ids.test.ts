import { describe, expect, it } from 'vitest'
import { diagramLabelId, diagramZoneId } from './diagram-ids'

describe('diagramLabelId', () => {
  it('matches the known JS/SQL derivation vector for a padded mixed-case label', () => {
    expect(diagramLabelId('  Runway   HEADING ')).toBe('l16d69ee79')
  })

  it('derives the same id for inputs differing only in case or whitespace', () => {
    expect(diagramLabelId('Runway Heading')).toBe(diagramLabelId('  runway   heading '))
  })

  it('derives a different id when the visible text differs', () => {
    expect(diagramLabelId('Runway Heading')).not.toBe(diagramLabelId('Downwind'))
  })

  it('starts with the l1 version prefix', () => {
    expect(diagramLabelId('anything')).toMatch(/^l1[0-9a-f]{8}$/)
  })
})

describe('diagramZoneId', () => {
  it('matches the known JS/SQL derivation vector for index 0 and 10', () => {
    expect(diagramZoneId('rwy-27-09-lh-pattern', 0)).toBe('z1fac643c6')
    expect(diagramZoneId('rwy-27-09-lh-pattern', 10)).toBe('z13f2bcb2d')
  })

  it('derives a different id per index', () => {
    expect(diagramZoneId('img', 0)).not.toBe(diagramZoneId('img', 1))
  })

  it('derives a different id per image_ref', () => {
    expect(diagramZoneId('img-a', 0)).not.toBe(diagramZoneId('img-b', 0))
  })

  it('normalizes image_ref case and surrounding whitespace', () => {
    expect(diagramZoneId('  IMG-A ', 3)).toBe(diagramZoneId('img-a', 3))
  })

  it('starts with the z1 version prefix', () => {
    expect(diagramZoneId('img', 2)).toMatch(/^z1[0-9a-f]{8}$/)
  })
})
