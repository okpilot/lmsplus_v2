import { describe, expect, it } from 'vitest'
import { type DialogLine, parseDialogDisplay } from './parse-dialog-display'

// Index access is narrowed under noUncheckedIndexedAccess; assert length first
// then read through a checked local so the tests stay readable.
function firstLine(template: string): DialogLine {
  const lines = parseDialogDisplay(template)
  expect(lines.length).toBeGreaterThan(0)
  const line = lines[0]
  if (!line) throw new Error('expected at least one parsed line')
  return line
}

describe('parseDialogDisplay', () => {
  it('parses a single line with a speaker tag and one blank', () => {
    const result = parseDialogDisplay('[atc] Cleared to land. {{0}} report vacated.')
    expect(result).toEqual([
      {
        speaker: 'atc',
        segments: [
          { type: 'text', value: 'Cleared to land. ' },
          { type: 'blank', index: 0 },
          { type: 'text', value: ' report vacated.' },
        ],
      },
    ])
  })

  it('parses multiple lines with different speakers', () => {
    const result = parseDialogDisplay('[atc] Climb to {{0}}.\n[pilot] Climbing to {{1}}.')
    expect(result).toEqual([
      {
        speaker: 'atc',
        segments: [
          { type: 'text', value: 'Climb to ' },
          { type: 'blank', index: 0 },
          { type: 'text', value: '.' },
        ],
      },
      {
        speaker: 'pilot',
        segments: [
          { type: 'text', value: 'Climbing to ' },
          { type: 'blank', index: 1 },
          { type: 'text', value: '.' },
        ],
      },
    ])
  })

  it('extracts every blank when a line has multiple blanks', () => {
    const blanks = firstLine('[pilot] {{0}} requesting {{1}} via {{2}}.').segments.filter(
      (s) => s.type === 'blank',
    )
    expect(blanks).toEqual([
      { type: 'blank', index: 0 },
      { type: 'blank', index: 1 },
      { type: 'blank', index: 2 },
    ])
  })

  it('treats a line with no speaker tag as speaker null', () => {
    const line = firstLine('Wind {{0}} degrees.')
    expect(line.speaker).toBeNull()
    expect(line.segments).toEqual([
      { type: 'text', value: 'Wind ' },
      { type: 'blank', index: 0 },
      { type: 'text', value: ' degrees.' },
    ])
  })

  it('returns a single text segment when a line has no blanks', () => {
    expect(firstLine('[atc] Roger, standby.').segments).toEqual([
      { type: 'text', value: 'Roger, standby.' },
    ])
  })

  it('trims leading and trailing whitespace and skips blank lines', () => {
    const result = parseDialogDisplay('   [atc] Taxi to {{0}}.   \n\n  ')
    expect(result).toEqual([
      {
        speaker: 'atc',
        segments: [
          { type: 'text', value: 'Taxi to ' },
          { type: 'blank', index: 0 },
          { type: 'text', value: '.' },
        ],
      },
    ])
  })

  it('extracts only the leading integer if a pipe-form marker is encountered', () => {
    // Defensive: client should never see this, but if it does, the canonical
    // after the pipe must not surface — only the index is extracted.
    expect(firstLine('[atc] {{0|S5-ABC;synonym}} cleared.').segments).toEqual([
      { type: 'blank', index: 0 },
      { type: 'text', value: ' cleared.' },
    ])
  })

  it('produces adjacent blank segments with no text segment between them', () => {
    // {{0}}{{1}} with nothing between — lastIndex === match.index, so no text push.
    const segments = firstLine('[pilot] {{0}}{{1}} feet.').segments
    expect(segments).toEqual([
      { type: 'blank', index: 0 },
      { type: 'blank', index: 1 },
      { type: 'text', value: ' feet.' },
    ])
  })
})
