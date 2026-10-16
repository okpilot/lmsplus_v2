import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoad, mockRequireAdmin, mockFrom } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('./admin-report-session', () => ({ loadAdminReportSession: mockLoad }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { getAdminQuizReportQuestions, getAdminQuizReportSummary } from './admin-quiz-report'

function usersChain(fullName: string | null) {
  const result = { data: { full_name: fullName }, error: null }
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (res: (v: unknown) => void) => Promise.resolve(result).then(res)
        return () => proxy
      },
    },
  )
  return proxy
}

const session = {
  id: 'sess-1',
  mode: 'quick_quiz',
  subject_id: null,
  started_at: '2026-03-12T10:00:00Z',
  ended_at: '2026-03-12T10:15:00Z',
  total_questions: 3,
  correct_count: 2,
  score_percentage: 60,
  student_id: 'stu-1',
  passed: null,
  time_limit_seconds: null,
}

// dialog_fill: q1 has two blank rows, q2 one.
const answerRows = [
  { question_id: 'q1', answered_at: '2026-03-12T10:01:00Z' },
  { question_id: 'q1', answered_at: '2026-03-12T10:01:00Z' },
  { question_id: 'q2', answered_at: '2026-03-12T10:02:00Z' },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'a', organizationId: 'org-1' })
  mockFrom.mockImplementation(() => usersChain('Alice'))
})

describe('admin report reads', () => {
  it('summary and questions of one render read through the loader with the same session id', async () => {
    mockLoad.mockResolvedValue({ ok: true, session, answerRows: [] })
    await getAdminQuizReportSummary('sess-1')
    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(mockLoad).toHaveBeenCalledTimes(2)
    expect(mockLoad.mock.calls.map((c) => c[0])).toEqual(['sess-1', 'sess-1'])
  })

  it('summary counts every answer row as an item and distinct question ids as answered questions', async () => {
    mockLoad.mockResolvedValue({ ok: true, session, answerRows })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result?.answeredItems).toBe(3)
    expect(result?.answeredQuestions).toBe(2)
    expect(result?.studentName).toBe('Alice')
  })

  it('summary is null and reads no user when the loader is not ok', async () => {
    mockLoad.mockResolvedValue({ ok: false })
    expect(await getAdminQuizReportSummary('sess-1')).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('questions fail with the generic message and read nothing else when the loader is not ok', async () => {
    mockLoad.mockResolvedValue({ ok: false })
    expect(await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })).toEqual({
      ok: false,
      error: 'Failed to load questions',
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('questions report the distinct question count from the loader rows when the page is out of range', async () => {
    mockLoad.mockResolvedValue({ ok: true, session, answerRows })
    expect(await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 99 })).toEqual({
      ok: true,
      questions: [],
      totalCount: 2,
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
