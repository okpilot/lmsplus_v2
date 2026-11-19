import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  attempts: vi.fn(),
  codes: vi.fn(),
  students: vi.fn(),
  subjects: vi.fn(),
  sittings: vi.fn(),
}))
vi.mock('../attempts-queries', () => ({ listInternalExamAttempts: m.attempts }))
vi.mock('../queries', () => ({ listInternalExamCodes: m.codes, listExamSubjects: m.subjects }))
vi.mock('../students-queries', () => ({ listOrgStudents: m.students }))
vi.mock('../sittings/queries', () => ({
  listSittings: m.sittings,
  listInvigilatorOptions: vi.fn().mockResolvedValue([]),
  getSitting: vi.fn(),
  getSummary: vi.fn(),
}))
vi.mock('./internal-exams-tabs', () => ({ InternalExamsTabs: () => null }))

import { InternalExamsContent } from './internal-exams-content'

const empty = { rows: [], totalCount: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  m.attempts.mockResolvedValue(empty)
  m.codes.mockResolvedValue(empty)
  m.subjects.mockResolvedValue([])
  m.students.mockResolvedValue([])
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

  it('loads the codes tab with codes only, no students or subjects', async () => {
    await InternalExamsContent({ ...props, tab: 'codes' } as never)
    expect(m.codes).toHaveBeenCalledTimes(1)
    expect(m.students).not.toHaveBeenCalled()
    expect(m.subjects).not.toHaveBeenCalled()
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
})
