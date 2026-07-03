import { describe, expect, it } from 'vitest'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'
import { nextUnsubmittedSection } from './section-progress'

function makeSession(overrides: Partial<OralSessionDetail> = {}): OralSessionDetail {
  return {
    id: 'sess-1',
    status: 'in_progress',
    mode: 'mock',
    sections: [
      { sectionNo: 1, type: 'interview' },
      { sectionNo: 2, type: 'picture' },
      { sectionNo: 3, type: 'comms' },
    ],
    responses: [],
    ...overrides,
  }
}

describe('nextUnsubmittedSection', () => {
  it('returns the first section when nothing has been submitted', () => {
    const current = nextUnsubmittedSection(makeSession())
    expect(current).toEqual({ sectionNo: 1, type: 'interview', isLast: false })
  })

  it('skips already-submitted sections and returns the next pending one', () => {
    const current = nextUnsubmittedSection(
      makeSession({ responses: [{ sectionNo: 1, status: 'grading' }] }),
    )
    expect(current).toEqual({ sectionNo: 2, type: 'picture', isLast: false })
  })

  it('marks the final remaining section as the last one', () => {
    const current = nextUnsubmittedSection(
      makeSession({
        responses: [
          { sectionNo: 1, status: 'grading' },
          { sectionNo: 2, status: 'grading' },
        ],
      }),
    )
    expect(current).toEqual({ sectionNo: 3, type: 'comms', isLast: true })
  })

  it('returns null when every planned section has a response', () => {
    const current = nextUnsubmittedSection(
      makeSession({
        responses: [
          { sectionNo: 1, status: 'grading' },
          { sectionNo: 2, status: 'grading' },
          { sectionNo: 3, status: 'grading' },
        ],
      }),
    )
    expect(current).toBeNull()
  })

  it('orders sections by section number regardless of their array order', () => {
    const current = nextUnsubmittedSection(
      makeSession({
        sections: [
          { sectionNo: 3, type: 'comms' },
          { sectionNo: 1, type: 'interview' },
          { sectionNo: 2, type: 'picture' },
        ],
      }),
    )
    expect(current).toEqual({ sectionNo: 1, type: 'interview', isLast: false })
  })

  it('treats a single-section practice session as the last section immediately', () => {
    const current = nextUnsubmittedSection(
      makeSession({ mode: 'practice', sections: [{ sectionNo: 1, type: 'interview' }] }),
    )
    expect(current).toEqual({ sectionNo: 1, type: 'interview', isLast: true })
  })
})
