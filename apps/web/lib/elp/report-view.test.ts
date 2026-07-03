import { describe, expect, it } from 'vitest'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'
import { deriveOralReportView } from './report-view'

// ---- Fixtures ---------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'

function practiceSession(overrides: Partial<OralSessionDetail> = {}): OralSessionDetail {
  return {
    id: SESSION_ID,
    status: 'in_progress',
    mode: 'practice',
    sections: [{ sectionNo: 1, type: 'interview' }],
    responses: [],
    ...overrides,
  }
}

function mockSession(overrides: Partial<OralSessionDetail> = {}): OralSessionDetail {
  return {
    id: SESSION_ID,
    status: 'in_progress',
    mode: 'mock',
    sections: [1, 2, 3, 4, 5].map((sectionNo) => ({ sectionNo, type: 'interview' })),
    responses: [],
    ...overrides,
  }
}

// ---- Tests --------------------------------------------------------------------

describe('deriveOralReportView', () => {
  it('returns graded when the session status is graded, regardless of response counts', () => {
    expect(
      deriveOralReportView(
        practiceSession({ status: 'graded', responses: [{ sectionNo: 1, status: 'graded' }] }),
      ),
    ).toBe('graded')
  })

  it('returns incomplete for a practice session with zero submitted sections', () => {
    expect(deriveOralReportView(practiceSession({ responses: [] }))).toBe('incomplete')
  })

  it('returns incomplete for a mock session that has submitted fewer sections than planned', () => {
    expect(
      deriveOralReportView(
        mockSession({
          responses: [
            { sectionNo: 1, status: 'grading' },
            { sectionNo: 2, status: 'grading' },
          ],
        }),
      ),
    ).toBe('incomplete')
  })

  it('returns failed when all planned sections are submitted and one has failed', () => {
    expect(
      deriveOralReportView(
        mockSession({
          responses: [1, 2, 3, 4, 5].map((sectionNo) => ({
            sectionNo,
            status: sectionNo === 3 ? 'failed' : 'grading',
          })),
        }),
      ),
    ).toBe('failed')
  })

  it('returns grading when all planned sections are submitted and none have failed', () => {
    expect(
      deriveOralReportView(practiceSession({ responses: [{ sectionNo: 1, status: 'grading' }] })),
    ).toBe('grading')
  })
})
