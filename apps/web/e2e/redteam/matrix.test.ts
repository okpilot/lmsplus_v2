import { describe, expect, it } from 'vitest'
import {
  assertVectorIds,
  compareVectorIds,
  extractIds,
  nextVectorId,
  parseMatrixRows,
} from './matrix'
import { matrixWithRow, VALID_ROW } from './matrix-fixtures'

describe('parseMatrixRows', () => {
  it('reads a row from the Vector-to-Spec Mapping table', () => {
    const rows = parseMatrixRows(matrixWithRow(VALID_ROW))
    expect(rows).toEqual([VALID_ROW])
  })

  it('keeps a literal pipe inside a cell when it is escaped', () => {
    const row = ['Z2', 'probe', 'HIGH', 'rate-limiting.spec.ts', 'FIXED', '', 'a\\|b']
    const rows = parseMatrixRows(matrixWithRow(row))
    expect(rows[0]?.[6]).toBe('a|b')
  })

  it('stops reading rows at the next heading', () => {
    const markdown = `${matrixWithRow(VALID_ROW)}\n\n## Files to Watch\n\n| not | a | matrix | row |`
    const rows = parseMatrixRows(markdown)
    expect(rows).toEqual([VALID_ROW])
  })
})

describe('extractIds', () => {
  it('reads the ID cell of every row matching the pattern', () => {
    expect(
      extractIds([
        ['A', 'x'],
        ['FV', 'y'],
      ]),
    ).toEqual(['A', 'FV'])
  })

  it('drops a row whose ID cell is not 1-3 capital letters', () => {
    expect(
      extractIds([
        ['fv1', 'x'],
        ['AA', 'y'],
      ]),
    ).toEqual(['AA'])
  })
})

describe('compareVectorIds', () => {
  it('orders a shorter ID before a longer one regardless of alphabet', () => {
    expect(compareVectorIds('Z', 'AA')).toBeLessThan(0)
  })

  it('orders same-length IDs alphabetically', () => {
    expect(compareVectorIds('AA', 'AB')).toBeLessThan(0)
    expect(compareVectorIds('FV', 'AA')).toBeGreaterThan(0)
  })

  it('treats identical IDs as equal', () => {
    expect(compareVectorIds('FV', 'FV')).toBe(0)
  })
})

describe('nextVectorId', () => {
  it('adds one within the same letter count', () => {
    expect(nextVectorId([['FV']])).toBe('FW')
  })

  it('carries Z to AA', () => {
    expect(nextVectorId([['Z']])).toBe('AA')
  })

  it('carries ZZ to AAA', () => {
    expect(nextVectorId([['ZZ']])).toBe('AAA')
  })

  it('takes the max across multiple lists', () => {
    expect(nextVectorId([['A', 'B'], ['FV'], ['C']])).toBe('FW')
  })

  it('ignores an id not matching the 1-3 capital letter pattern', () => {
    expect(nextVectorId([['fv1', 'A']])).toBe('B')
  })

  it('counts extra ids already allocated this run', () => {
    expect(nextVectorId([['FV'], ['FW']])).toBe('FX')
  })

  it('throws when every list is empty', () => {
    expect(() => nextVectorId([[], []])).toThrow(/no IDs/)
  })

  it('throws at ZZZ, the last representable id', () => {
    expect(() => nextVectorId([['ZZZ']])).toThrow(/ZZZ/)
  })
})

describe('assertVectorIds', () => {
  it('accepts capital-letter ids', () => {
    expect(() => assertVectorIds(['A', 'FW', 'ZZZ'])).not.toThrow()
  })

  it('rejects a lowercase or comma-joined id, naming it', () => {
    expect(() => assertVectorIds(['FW', 'fw', 'FX,FY'])).toThrow(/fw, FX,FY/)
  })
})
