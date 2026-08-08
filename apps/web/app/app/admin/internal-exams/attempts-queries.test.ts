import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockAdminFrom } }))

// ---- Subject under test ---------------------------------------------------

import { listInternalExamAttempts } from './attempts-queries'

// ---- Helpers ---------------------------------------------------------------

const ORG_ID = 'org-001'
const NOW = new Date('2026-04-28T12:00:00.000Z')
const PAST = new Date('2026-04-27T12:00:00.000Z').toISOString()

type ChainMock = Record<string, ReturnType<typeof vi.fn>>

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockAdminFrom },
    organizationId: ORG_ID,
    userId: 'admin-001',
  })
}

/**
 * Builds a chainable Supabase mock. Every chain method returns the same builder.
 * The builder is thenable — awaiting it resolves to { data, error, count }. The
 * queries run a count query (reads `count`) then a data query (reads `data`);
 * both await the SAME builder, so rows-asserting tests must supply a non-zero
 * `count` or the count-first early-return yields an empty result.
 */
function buildChain(
  data: unknown,
  error: { message: string } | null = null,
  count: number | null = null,
): ChainMock {
  const resolved = { data, error, count }
  const builder: ChainMock = {}
  for (const fn of ['select', 'eq', 'is', 'not', 'order', 'limit', 'lte', 'gt', 'range']) {
    builder[fn] = vi.fn().mockReturnValue(builder)
  }
  // biome-ignore lint/suspicious/noThenProperty: supabase chain must be thenable to mock awaiting the query builder
  builder.then = vi.fn((cb: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(cb))
  return builder
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
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
      mockAdminFrom.mockReturnValue(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.totalCount).toBe(1)
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
      mockAdminFrom.mockReturnValue(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.voidReason).toBe('cheating detected')
    })

    it('preserves a null subjectId when the session has no subject', async () => {
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
      mockAdminFrom.mockReturnValue(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.subjectId).toBeNull()
    })
  })

  describe('filters', () => {
    function makeRow() {
      return {
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
      }
    }

    it('scopes the query to a single student when studentId is set', async () => {
      mockAdmin()
      const chain = buildChain([makeRow()], null, 1)
      mockAdminFrom.mockReturnValue(chain)

      await listInternalExamAttempts({ studentId: 'stu-2' })

      const eqCalls = chain.eq?.mock.calls ?? []
      expect(
        eqCalls.filter(([column, value]) => column === 'student_id' && value === 'stu-2'),
      ).toHaveLength(2)
    })

    it('scopes the query to a single subject when subjectId is set', async () => {
      mockAdmin()
      const chain = buildChain([makeRow()], null, 1)
      mockAdminFrom.mockReturnValue(chain)

      await listInternalExamAttempts({ subjectId: 'sub-1' })

      const eqCalls = chain.eq?.mock.calls ?? []
      expect(
        eqCalls.filter(([column, value]) => column === 'subject_id' && value === 'sub-1'),
      ).toHaveLength(2)
    })

    it("restricts results to the caller's own organization", async () => {
      mockAdmin()
      const chain = buildChain([makeRow()], null, 1)
      mockAdminFrom.mockReturnValue(chain)

      await listInternalExamAttempts({})

      // Both the count and the rows builder must carry it: if the org filter is
      // dropped from either, an admin sees another organization's data.
      const eqCalls = chain.eq?.mock.calls ?? []
      expect(
        eqCalls.filter(([column, value]) => column === 'organization_id' && value === ORG_ID),
      ).toHaveLength(2)
    })
  })

  describe('pagination', () => {
    function makeRow(n: number) {
      return {
        id: `sess-${n}`,
        student_id: 'stu-1',
        subject_id: 'sub-1',
        started_at: `2026-04-2${n}T00:00:00.000Z`,
        ended_at: `2026-04-2${n}T01:00:00.000Z`,
        total_questions: 20,
        correct_count: 10,
        score_percentage: 50,
        passed: false,
        easa_subjects: null,
        users: null,
        internal_exam_codes: null,
      }
    }

    it('returns the total count alongside the first page of rows', async () => {
      mockAdmin()
      const chain = buildChain([makeRow(1), makeRow(2)], null, 40)
      mockAdminFrom.mockReturnValue(chain)

      const result = await listInternalExamAttempts({ page: 1 })

      expect(result.totalCount).toBe(40)
      expect(chain.range).toHaveBeenCalledWith(0, 24)
    })

    it('returns the second page of results when page=2 is set', async () => {
      mockAdmin()
      const chain = buildChain([makeRow(1)], null, 40)
      mockAdminFrom.mockReturnValue(chain)

      await listInternalExamAttempts({ page: 2 })

      expect(chain.range).toHaveBeenCalledWith(25, 49)
    })

    it('returns an empty page without querying rows when there are no attempts', async () => {
      mockAdmin()
      const chain = buildChain([], null, 0)
      mockAdminFrom.mockReturnValue(chain)

      const result = await listInternalExamAttempts()

      expect(result.rows).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect(chain.range).not.toHaveBeenCalled()
    })

    it('returns the last page of rows when the requested page is past the end', async () => {
      mockAdmin()
      // count=40 → totalPages=2; page=99 snaps to page 2 → range(25, 49).
      const chain = buildChain([makeRow(1)], null, 40)
      mockAdminFrom.mockReturnValue(chain)

      const result = await listInternalExamAttempts({ page: 99 })

      expect(result.rows).toHaveLength(1)
      expect(result.totalCount).toBe(40)
      expect(chain.range).toHaveBeenCalledWith(25, 49)
    })

    it('returns an empty rows array when the rows query yields null data', async () => {
      mockAdmin()
      // Count reports rows exist, but the data query returns null (e.g. transport quirk).
      mockAdminFrom
        .mockReturnValueOnce(buildChain([], null, 5))
        .mockReturnValueOnce(buildChain(null, null, 5))

      const result = await listInternalExamAttempts()

      expect(result.rows).toEqual([])
      expect(result.totalCount).toBe(5)
    })
  })

  describe('error propagation', () => {
    it('throws a sanitized message and logs the raw error when the count query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        mockAdmin()
        mockAdminFrom.mockReturnValue(buildChain(null, { message: 'attempts count error' }))

        await expect(listInternalExamAttempts()).rejects.toThrow(
          'Failed to load internal exam attempts',
        )
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[listInternalExamAttempts] count error:',
          'attempts count error',
        )
      } finally {
        consoleErrorSpy.mockRestore()
      }
    })

    it('throws a sanitized message and logs the raw error when the rows query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        mockAdmin()
        mockAdminFrom
          .mockReturnValueOnce(buildChain([], null, 5))
          .mockReturnValueOnce(buildChain(null, { message: 'attempts rows error' }))

        await expect(listInternalExamAttempts()).rejects.toThrow(
          'Failed to load internal exam attempts',
        )
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[listInternalExamAttempts] DB error:',
          'attempts rows error',
        )
      } finally {
        consoleErrorSpy.mockRestore()
      }
    })
  })

  describe('auth guard', () => {
    it('propagates errors from requireAdmin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))

      await expect(listInternalExamAttempts()).rejects.toThrow('Forbidden')
    })
  })

  describe('bigint/numeric wire-value coercion', () => {
    it('coerces string wire value for score_percentage to number', async () => {
      // PostgREST serialises NUMERIC as a JSON string; verify coercion to number.
      mockAdmin()
      const row = {
        id: 'sess-coerce',
        student_id: 'stu-1',
        subject_id: 'sub-1',
        started_at: PAST,
        ended_at: PAST,
        total_questions: 20,
        correct_count: 15,
        score_percentage: '73.33',
        passed: true,
        easa_subjects: { name: 'Navigation' },
        users: { full_name: 'Alice', email: 'alice@example.com' },
        internal_exam_codes: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.scorePercentage).toBe(73.33)
      expect(typeof result.rows[0]!.scorePercentage).toBe('number')
    })

    it('preserves null scorePercentage when wire value is null', async () => {
      mockAdmin()
      const row = {
        id: 'sess-null',
        student_id: 'stu-1',
        subject_id: 'sub-1',
        started_at: PAST,
        ended_at: PAST,
        total_questions: 20,
        correct_count: 0,
        score_percentage: null,
        passed: null,
        easa_subjects: null,
        users: null,
        internal_exam_codes: null,
      }
      mockAdminFrom.mockReturnValue(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.scorePercentage).toBeNull()
    })
  })
})
