import { describe, expect, it } from 'vitest'
import {
  isDiagramMappingArray,
  isDiagramMappingEntry,
  isValidDiagramMapping,
  MAX_LABELS,
  MAX_ZONES,
} from './diagram-validation'

describe('diagram-validation constants', () => {
  it('bounds a submitted mapping at 50 zones', () => {
    expect(MAX_ZONES).toBe(50)
  })

  it('bounds the delivered labels array at 60', () => {
    expect(MAX_LABELS).toBe(60)
  })
})

describe('isDiagramMappingEntry', () => {
  it('accepts a well-formed {zoneId, labelId} pair', () => {
    expect(isDiagramMappingEntry({ zoneId: 'z1', labelId: 'l1' })).toBe(true)
  })

  it('rejects a non-object value', () => {
    expect(isDiagramMappingEntry('z1')).toBe(false)
    expect(isDiagramMappingEntry(null)).toBe(false)
  })

  it('rejects a blank or whitespace-only zoneId', () => {
    expect(isDiagramMappingEntry({ zoneId: '', labelId: 'l1' })).toBe(false)
    expect(isDiagramMappingEntry({ zoneId: '   ', labelId: 'l1' })).toBe(false)
  })

  it('rejects a blank or whitespace-only labelId', () => {
    expect(isDiagramMappingEntry({ zoneId: 'z1', labelId: '' })).toBe(false)
    expect(isDiagramMappingEntry({ zoneId: 'z1', labelId: '   ' })).toBe(false)
  })

  it('rejects a non-string zoneId or labelId', () => {
    expect(isDiagramMappingEntry({ zoneId: 1, labelId: 'l1' })).toBe(false)
    expect(isDiagramMappingEntry({ zoneId: 'z1', labelId: 2 })).toBe(false)
  })
})

describe('isValidDiagramMapping', () => {
  it('returns true when zoneIds and labelIds are each distinct', () => {
    expect(
      isValidDiagramMapping([
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l2' },
      ]),
    ).toBe(true)
  })

  it('returns true for a partial (single-entry) mapping', () => {
    expect(isValidDiagramMapping([{ zoneId: 'z1', labelId: 'l1' }])).toBe(true)
  })

  it('returns true for an empty mapping', () => {
    expect(isValidDiagramMapping([])).toBe(true)
  })

  it('returns false when the same zoneId is placed twice', () => {
    expect(
      isValidDiagramMapping([
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z1', labelId: 'l2' },
      ]),
    ).toBe(false)
  })

  it('returns false when the same labelId is placed on two zones (chip reuse)', () => {
    expect(
      isValidDiagramMapping([
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l1' },
      ]),
    ).toBe(false)
  })
})

describe('isDiagramMappingArray', () => {
  it('accepts a valid non-empty array of mapping entries', () => {
    expect(isDiagramMappingArray([{ zoneId: 'z1', labelId: 'l1' }])).toBe(true)
  })

  it('rejects a non-array value', () => {
    expect(isDiagramMappingArray({ zoneId: 'z1', labelId: 'l1' })).toBe(false)
  })

  it('rejects an empty array', () => {
    expect(isDiagramMappingArray([])).toBe(false)
  })

  it('rejects an array longer than MAX_ZONES', () => {
    const tooMany = Array.from({ length: MAX_ZONES + 1 }, (_, i) => ({
      zoneId: `z${i}`,
      labelId: `l${i}`,
    }))
    expect(isDiagramMappingArray(tooMany)).toBe(false)
  })

  it('rejects an array containing a malformed element', () => {
    expect(isDiagramMappingArray([{ zoneId: 'z1', labelId: 'l1' }, { zoneId: 'z2' }])).toBe(false)
  })

  it('rejects an array with a duplicate zoneId', () => {
    expect(
      isDiagramMappingArray([
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z1', labelId: 'l2' },
      ]),
    ).toBe(false)
  })
})
