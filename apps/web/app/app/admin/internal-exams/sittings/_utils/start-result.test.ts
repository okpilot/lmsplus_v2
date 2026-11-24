import { describe, expect, it } from 'vitest'
import { startResultBanner } from './start-result'

const NO_CODE = 'exams have no code yet. They cannot start until you issue codes.'
const INVIGILATOR = 'The assigned invigilator Jane Doe is no longer an active admin or instructor.'

describe('startResultBanner', () => {
  it('warns about an inactive invigilator when no codes are missing', () => {
    const r = startResultBanner(
      { entriesWithoutCode: 0, codesRestamped: 0, invigilatorActive: false },
      'Jane Doe',
    )
    expect(r).toEqual({ tone: 'caution', title: 'Sitting started.', detail: INVIGILATOR })
  })

  it('lists the no-code line before the invigilator line when both apply', () => {
    const r = startResultBanner(
      { entriesWithoutCode: 2, codesRestamped: 0, invigilatorActive: false },
      'Jane Doe',
    )
    expect(r.tone).toBe('caution')
    expect(r.detail).toContain(NO_CODE)
    expect(r.detail).toContain(INVIGILATOR)
    expect(r.detail?.indexOf(NO_CODE)).toBeLessThan(r.detail?.indexOf(INVIGILATOR) ?? -1)
  })

  it('reports success with the restamp detail when active and nothing is missing', () => {
    const r = startResultBanner(
      { entriesWithoutCode: 0, codesRestamped: 3, invigilatorActive: true },
      'Jane Doe',
    )
    expect(r.tone).toBe('success')
    expect(r.detail).toBe('3 codes will work until you close the sitting or the day ends (UTC).')
  })

  it('warns with only the no-code line when the invigilator is active', () => {
    const r = startResultBanner(
      { entriesWithoutCode: 1, codesRestamped: 0, invigilatorActive: true },
      'Jane Doe',
    )
    expect(r.tone).toBe('caution')
    expect(r.detail).toContain('no code yet')
    expect(r.detail).not.toContain('no longer an active')
  })
})
