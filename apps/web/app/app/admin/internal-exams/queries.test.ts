import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockAdminFrom } }))

// ---- Subject under test ---------------------------------------------------

import { listInternalExamAttempts, listInternalExamCodes } from './queries'

// ---- Helpers ---------------------------------------------------------------

const ORG_ID = 'org-001'
const NOW = new Date('2026-04-28T12:00:00.000Z')
const FUTURE = new Date('2026-04-29T12:00:00.000Z').toISOString()
const PAST = new Date('2026-04-27T12:00:00.000Z').toISOString()

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockAdminFrom },
    organizationId: ORG_ID,
    userId: 'admin-001',
  })
}

/**
 * Builds a chainable Supabase mock. Every chain method returns the same builder.
 * The builder is thenable — awaiting it resolves to { data, error }.
 */
function buildChain(data: unknown, error: { message: string } | null = null) {
  const resolved = { data, error }
  const builder: Record<string, unknown> = {}
  for (const fn of ['select', 'eq', 'is', 'not', 'order', 'limit', 'lte', 'gt']) {
    builder[fn] = vi.fn().mockReturnValue(builder)
  }
  // biome-ignore lint/suspicious/noThenProperty: supabase chain must be thenable to mock awaiting the query builder
  builder.then = (cb: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(cb)
  return builder
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

describe('listInternalExamCodes', () => {
  describe('happy path', () => {
    it('returns mapped rows with derived status="active" for unconsumed un-voided unexpired codes', async () => {
      mockAdmin()
      const row = {
        id: 'code-1',
        code: 'ABC23456',
        subject_id: 'sub-1',
        student_id: 'stu-1',
        issued_by: 'admin-1',
        issued_at: PAST,
        expires_at: FUTURE,
        consumed_at: null,
        consumed_session_id: null,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        easa_subjects: { name: 'Meteorology' },
        users: { full_name: 'Alice', email: 'alice@example.com' },
        quiz_sessions: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamCodes()

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!).toMatchObject({
        id: 'code-1',
        code: 'ABC23456',
        subjectId: 'sub-1',
        subjectName: 'Meteorology',
        studentId: 'stu-1',
        studentName: 'Alice',
        studentEmail: 'alice@example.com',
        status: 'active',
      })
    })

    it('derives status="voided" when voided_at is set', async () => {
      mockAdmin()
      const row = {
        id: 'code-1',
        code: 'CODE0001',
        subject_id: 'sub-1',
        student_id: 'stu-1',
        issued_by: 'a',
        issued_at: PAST,
        expires_at: FUTURE,
        consumed_at: null,
        consumed_session_id: null,
        voided_at: PAST,
        voided_by: 'admin-1',
        void_reason: 'mistake',
        easa_subjects: null,
        users: null,
        quiz_sessions: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamCodes()

      expect(result.rows[0]!.status).toBe('voided')
    })

    it('derives status="consumed" when consumed_at is set', async () => {
      mockAdmin()
      const row = {
        id: 'code-1',
        code: 'CODE0002',
        subject_id: 'sub-1',
        student_id: 'stu-1',
        issued_by: 'a',
        issued_at: PAST,
        expires_at: FUTURE,
        consumed_at: PAST,
        consumed_session_id: 'sess-1',
        voided_at: null,
        voided_by: null,
        void_reason: null,
        easa_subjects: null,
        users: null,
        quiz_sessions: { ended_at: PAST },
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamCodes()

      expect(result.rows[0]!.status).toBe('consumed')
      expect(result.rows[0]!.sessionEndedAt).toBe(PAST)
    })

    it('derives status="expired" when expires_at is in the past and not consumed', async () => {
      mockAdmin()
      const row = {
        id: 'code-1',
        code: 'CODE0003',
        subject_id: 'sub-1',
        student_id: 'stu-1',
        issued_by: 'a',
        issued_at: PAST,
        expires_at: PAST,
        consumed_at: null,
        consumed_session_id: null,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        easa_subjects: null,
        users: null,
        quiz_sessions: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamCodes()

      expect(result.rows[0]!.status).toBe('expired')
    })

    it('falls back to empty strings when join data is missing', async () => {
      mockAdmin()
      const row = {
        id: 'code-1',
        code: 'CODE0004',
        subject_id: 'sub-1',
        student_id: 'stu-1',
        issued_by: 'a',
        issued_at: PAST,
        expires_at: FUTURE,
        consumed_at: null,
        consumed_session_id: null,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        easa_subjects: null,
        users: null,
        quiz_sessions: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamCodes()

      expect(result.rows[0]!.subjectName).toBe('')
      expect(result.rows[0]!.studentName).toBe('')
      expect(result.rows[0]!.studentEmail).toBe('')
    })
  })

  describe('filters', () => {
    function makeRows() {
      return [
        {
          id: 'code-active',
          code: 'A',
          subject_id: 'sub-1',
          student_id: 'stu-1',
          issued_by: 'a',
          issued_at: PAST,
          expires_at: FUTURE,
          consumed_at: null,
          consumed_session_id: null,
          voided_at: null,
          voided_by: null,
          void_reason: null,
          easa_subjects: null,
          users: null,
          quiz_sessions: null,
        },
        {
          id: 'code-voided',
          code: 'B',
          subject_id: 'sub-2',
          student_id: 'stu-2',
          issued_by: 'a',
          issued_at: PAST,
          expires_at: FUTURE,
          consumed_at: null,
          consumed_session_id: null,
          voided_at: PAST,
          voided_by: 'a',
          void_reason: 'r',
          easa_subjects: null,
          users: null,
          quiz_sessions: null,
        },
      ]
    }

    it('filters by status', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(makeRows()))

      const result = await listInternalExamCodes({ status: 'voided' })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.id).toBe('code-voided')
    })

    it('returns only consumed-with-ended-session rows for status=finished', async () => {
      // 'finished' = code is consumed AND the linked quiz_sessions row has
      // ended_at set. 'consumed' = consumed but session still in flight.
      // The split happens in the TS post-step (queries.ts ~L156-159).
      const rows = [
        {
          id: 'code-in-flight',
          code: 'IF',
          subject_id: 'sub-1',
          student_id: 'stu-1',
          issued_by: 'a',
          issued_at: PAST,
          expires_at: FUTURE,
          consumed_at: PAST,
          consumed_session_id: 'sess-in-flight',
          voided_at: null,
          voided_by: null,
          void_reason: null,
          easa_subjects: null,
          users: null,
          quiz_sessions: { ended_at: null },
        },
        {
          id: 'code-finished',
          code: 'FN',
          subject_id: 'sub-1',
          student_id: 'stu-1',
          issued_by: 'a',
          issued_at: PAST,
          expires_at: FUTURE,
          consumed_at: PAST,
          consumed_session_id: 'sess-done',
          voided_at: null,
          voided_by: null,
          void_reason: null,
          easa_subjects: null,
          users: null,
          quiz_sessions: { ended_at: PAST },
        },
      ]
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(rows))

      const result = await listInternalExamCodes({ status: 'finished' })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.id).toBe('code-finished')
      expect(result.rows[0]!.sessionEndedAt).toBe(PAST)
    })

    it('returns only consumed-without-ended-session rows for status=consumed', async () => {
      const rows = [
        {
          id: 'code-in-flight',
          code: 'IF',
          subject_id: 'sub-1',
          student_id: 'stu-1',
          issued_by: 'a',
          issued_at: PAST,
          expires_at: FUTURE,
          consumed_at: PAST,
          consumed_session_id: 'sess-in-flight',
          voided_at: null,
          voided_by: null,
          void_reason: null,
          easa_subjects: null,
          users: null,
          quiz_sessions: { ended_at: null },
        },
        {
          id: 'code-finished',
          code: 'FN',
          subject_id: 'sub-1',
          student_id: 'stu-1',
          issued_by: 'a',
          issued_at: PAST,
          expires_at: FUTURE,
          consumed_at: PAST,
          consumed_session_id: 'sess-done',
          voided_at: null,
          voided_by: null,
          void_reason: null,
          easa_subjects: null,
          users: null,
          quiz_sessions: { ended_at: PAST },
        },
      ]
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(rows))

      const result = await listInternalExamCodes({ status: 'consumed' })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.id).toBe('code-in-flight')
    })

    it('filters by studentId', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(makeRows()))

      const result = await listInternalExamCodes({ studentId: 'stu-1' })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.studentId).toBe('stu-1')
    })

    it('filters by subjectId', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(makeRows()))

      const result = await listInternalExamCodes({ subjectId: 'sub-2' })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.subjectId).toBe('sub-2')
    })
  })

  describe('pagination', () => {
    it('returns nextCursor when there are more rows than the limit', async () => {
      mockAdmin()
      // 3 rows when limit is 2 → fetched limit+1 (3), so hasMore=true, return 2 rows
      const rows = [1, 2, 3].map((n) => ({
        id: `code-${n}`,
        code: `C${n}`,
        subject_id: 'sub-1',
        student_id: 'stu-1',
        issued_by: 'a',
        issued_at: `2026-04-2${n}T00:00:00.000Z`,
        expires_at: FUTURE,
        consumed_at: null,
        consumed_session_id: null,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        easa_subjects: null,
        users: null,
        quiz_sessions: null,
      }))
      mockAdminFrom.mockReturnValue(buildChain(rows))

      const result = await listInternalExamCodes({ limit: 2 })

      expect(result.rows).toHaveLength(2)
      expect(result.nextCursor).toBe('2026-04-22T00:00:00.000Z')
    })

    it('returns null nextCursor when no more rows remain', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain([]))

      const result = await listInternalExamCodes()

      expect(result.rows).toHaveLength(0)
      expect(result.nextCursor).toBeNull()
    })
  })

  describe('error propagation', () => {
    it('throws when the codes query returns an error', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(null, { message: 'codes DB error' }))

      await expect(listInternalExamCodes()).rejects.toThrow('codes DB error')
    })
  })

  describe('auth guard', () => {
    it('propagates errors from requireAdmin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))

      await expect(listInternalExamCodes()).rejects.toThrow('Forbidden')
    })
  })
})

describe('listInternalExamAttempts', () => {
  describe('happy path', () => {
    it('returns mapped rows for completed internal_exam sessions', async () => {
      mockAdmin()
      const row = {
        id: 'sess-1',
        student_id: 'stu-1',
        subject_id: 'sub-1',
        started_at: PAST,
        ended_at: PAST,
        total_questions: 20,
        correct_count: 15,
        score_percentage: 75,
        passed: true,
        easa_subjects: { name: 'Meteorology' },
        users: { full_name: 'Alice', email: 'alice@example.com' },
        internal_exam_codes: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamAttempts()

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!).toMatchObject({
        sessionId: 'sess-1',
        studentId: 'stu-1',
        studentName: 'Alice',
        studentEmail: 'alice@example.com',
        subjectId: 'sub-1',
        subjectName: 'Meteorology',
        totalQuestions: 20,
        correctCount: 15,
        scorePercentage: 75,
        passed: true,
        voidReason: null,
      })
    })

    it('surfaces voidReason from the linked internal_exam_code', async () => {
      mockAdmin()
      const row = {
        id: 'sess-1',
        student_id: 'stu-1',
        subject_id: 'sub-1',
        started_at: PAST,
        ended_at: PAST,
        total_questions: 20,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        easa_subjects: null,
        users: null,
        internal_exam_codes: [{ void_reason: 'cheating detected' }],
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.voidReason).toBe('cheating detected')
    })

    it('falls back to empty string when subject_id is null', async () => {
      mockAdmin()
      const row = {
        id: 'sess-1',
        student_id: 'stu-1',
        subject_id: null,
        started_at: PAST,
        ended_at: PAST,
        total_questions: 20,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        easa_subjects: null,
        users: null,
        internal_exam_codes: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row]))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.subjectId).toBe('')
    })
  })

  describe('filters', () => {
    function makeRows() {
      return [
        {
          id: 'sess-1',
          student_id: 'stu-1',
          subject_id: 'sub-1',
          started_at: PAST,
          ended_at: PAST,
          total_questions: 20,
          correct_count: 15,
          score_percentage: 75,
          passed: true,
          easa_subjects: null,
          users: null,
          internal_exam_codes: null,
        },
        {
          id: 'sess-2',
          student_id: 'stu-2',
          subject_id: 'sub-2',
          started_at: PAST,
          ended_at: PAST,
          total_questions: 20,
          correct_count: 5,
          score_percentage: 25,
          passed: false,
          easa_subjects: null,
          users: null,
          internal_exam_codes: null,
        },
      ]
    }

    it('filters by studentId', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(makeRows()))

      const result = await listInternalExamAttempts({ studentId: 'stu-2' })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.studentId).toBe('stu-2')
    })

    it('filters by subjectId', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(makeRows()))

      const result = await listInternalExamAttempts({ subjectId: 'sub-1' })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.subjectId).toBe('sub-1')
    })
  })

  describe('error propagation', () => {
    it('throws when the attempts query returns an error', async () => {
      mockAdmin()
      mockAdminFrom.mockReturnValue(buildChain(null, { message: 'attempts DB error' }))

      await expect(listInternalExamAttempts()).rejects.toThrow('attempts DB error')
    })
  })

  describe('auth guard', () => {
    it('propagates errors from requireAdmin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))

      await expect(listInternalExamAttempts()).rejects.toThrow('Forbidden')
    })
  })
})
