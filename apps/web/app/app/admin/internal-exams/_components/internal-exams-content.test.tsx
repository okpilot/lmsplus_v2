import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  attempts: vi.fn(),
  codes: vi.fn(),
  sittings: vi.fn(),
}))
vi.mock('../attempts-queries', () => ({ listInternalExamAttempts: m.attempts }))
vi.mock('../queries', () => ({ listInternalExamCodes: m.codes }))
vi.mock('../sittings/queries', () => ({
  listSittings: m.sittings,
  listInvigilatorOptions: vi.fn().mockResolvedValue([]),
  getSitting: vi.fn(),
  getSummary: vi.fn(),
}))
vi.mock('../notice-queries', () => ({}))
const opts = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../attempt-filter-options', () => ({
  getAttemptFilterOptions: opts.load,
  loadAttemptFilterOptions: opts.load,
}))
vi.mock('./internal-exams-tabs', () => ({ InternalExamsTabs: () => null }))

import { InternalExamsContent } from './internal-exams-content'

const empty = { rows: [], totalCount: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  m.attempts.mockResolvedValue(empty)
  m.codes.mockResolvedValue(empty)
  m.sittings.mockResolvedValue(empty)
})

const props = { codesPage: 1, attemptsPage: 1, sittingsPage: 1, scope: 'upcoming', dlg: undefined }

describe('InternalExamsContent', () => {
  it('fetches only the sittings list on the sittings tab', async () => {
    await InternalExamsContent({ ...props, tab: 'sittings' } as never)
    expect(m.sittings).toHaveBeenCalledWith('upcoming', 1)
    expect(m.codes).not.toHaveBeenCalled()
    expect(m.attempts).not.toHaveBeenCalled()
  })

  it('does not fetch sittings on the codes tab', async () => {
    await InternalExamsContent({ ...props, tab: 'codes' } as never)
    expect(m.codes).toHaveBeenCalled()
    expect(m.sittings).not.toHaveBeenCalled()
    expect(m.attempts).not.toHaveBeenCalled()
  })

  it('loads the codes tab with a single codes query', async () => {
    await InternalExamsContent({ ...props, tab: 'codes' } as never)
    expect(m.codes).toHaveBeenCalledTimes(1)
  })

  it('does not pass students or subjects props to the tabs', async () => {
    const el = await InternalExamsContent({ ...props, tab: 'codes' } as never)
    const keys = new Set<string>()
    const walk = (v: unknown, depth = 0) => {
      if (!v || typeof v !== 'object' || depth > 6) return
      for (const [k, c] of Object.entries(v)) {
        keys.add(k)
        walk(c, depth + 1)
      }
    }
    walk(el)
    expect(keys.has('students')).toBe(false)
    expect(keys.has('subjects')).toBe(false)
  })

  it('fetches only attempts on the attempts tab', async () => {
    await InternalExamsContent({ ...props, tab: 'attempts' } as never)
    expect(m.attempts).toHaveBeenCalled()
    expect(m.sittings).not.toHaveBeenCalled()
    expect(m.codes).not.toHaveBeenCalled()
  })

  it('maps URL filters into ListAttemptsFilters on the attempts tab', async () => {
    const id = '3f2b8c1e-5d4a-4c6b-9e7f-1a2b3c4d5e6f'
    await InternalExamsContent({
      ...props,
      tab: 'attempts',
      q: 'ann',
      subject: id,
      sitting: id,
      group: id,
    } as never)
    expect(m.attempts).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'ann', subjectId: id, sittingId: id, groupId: id }),
    )
  })

  it('loads the filter options only on the attempts tab', async () => {
    opts.load.mockResolvedValue({ subjects: [], sittings: [], groups: [] })
    await InternalExamsContent({ ...props, tab: 'codes' } as never)
    await InternalExamsContent({ ...props, tab: 'sittings' } as never)
    expect(opts.load).not.toHaveBeenCalled()
    await InternalExamsContent({ ...props, tab: 'attempts' } as never)
    expect(opts.load).toHaveBeenCalledTimes(1)
  })
})
