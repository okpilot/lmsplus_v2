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
 * Builds a chainable Supabase mock. Any chain method name returns the same builder
 * (a Proxy, so it never needs to enumerate the exact PostgREST methods a caller
 * uses — `attempts-queries.ts` calls `select/eq/is/not/order/range`, and the
 * `fetchAnsweredItemCounts` helper it calls internally may use others, e.g. `.in()`).
 * The builder is thenable — awaiting it resolves to { data, error, count }.
 */
function buildChain(
  data: unknown,
  error: { message: string } | null = null,
  count: number | null = null,
): ChainMock {
  const resolved = { data, error, count }
  const target: ChainMock = {}
  const builder = new Proxy(target, {
    get(t, prop: string) {
      if (prop === 'then') {
        return vi.fn((cb: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(cb))
      }
      if (!(prop in t)) {
        t[prop] = vi.fn().mockReturnValue(builder)
      }
      return t[prop]
    },
  })
  return builder as ChainMock
}

/**
 * Wires `mockAdminFrom` to dispatch by table name. `listInternalExamAttempts` queries
 * `quiz_sessions` twice (count, then rows) through the SAME mocked `@repo/db/admin`
 * module that its internal call to `fetchAnsweredItemCounts` uses to query
 * `quiz_session_answers` — a single module-wide `from` mock therefore has to route
 * each table to its own chain, or the third (`quiz_session_answers`) call silently
 * consumes a `quiz_sessions` chain meant for the rows query.
 *
 * `sessionsChains` is consumed in call order for `quiz_sessions` — the last chain
 * supplied repeats for any further call, so a single chain (the common case) serves
 * both the count and the rows query, matching the old `mockReturnValue` behavior.
 * `answersChain` defaults to an empty result (`answeredItems` = 0) for tests that
 * don't care about item counts. Its `count` must be `0`, not `null` — `fetchAllRows`
 * (which `fetchAnsweredItemCounts` pages through) treats a `null` count as a failed
 * "no exact count" read, not an empty table, and would surface that as an error here.
 */
function mockFrom(
  sessionsChains: ChainMock | ChainMock[],
  answersChain: ChainMock = buildChain([], null, 0),
) {
  const chains = Array.isArray(sessionsChains) ? sessionsChains : [sessionsChains]
  let callIndex = 0
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'quiz_session_answers') return answersChain
    const chain = chains[Math.min(callIndex, chains.length - 1)]
    callIndex += 1
    return chain
  })
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
      mockFrom(buildChain([row], null, 1))

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
      mockFrom(buildChain([row], null, 1))

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
      mockFrom(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.subjectId).toBeNull()
    })

    it('derives answeredItems from the number of recorded answer rows, not from the question count', async () => {
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
      // Three recorded answer rows for sess-1 — deliberately distinct from
      // total_questions (20) so a regression that falls back to the question count
      // cannot pass this assertion by coincidence.
      const answerRows = [
        { session_id: 'sess-1' },
        { session_id: 'sess-1' },
        { session_id: 'sess-1' },
      ]
      mockFrom(buildChain([row], null, 1), buildChain(answerRows, null, answerRows.length))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.answeredItems).toBe(3)
      expect(result.rows[0]!.answeredItems).not.toBe(row.total_questions)
    })

    it('defaults answeredItems to 0 when the session has no recorded answer rows', async () => {
      // mockFrom's default answersChain resolves to zero rows, so fetchAnsweredItemCounts
      // returns a Map with no entry for sess-1 — this exercises the
      // `itemCounts.get(r.id) ?? 0` fallback at the call site (attempts-queries.ts), which
      // the "derives answeredItems" test above cannot reach because it always seeds a match.
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
      mockFrom(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.answeredItems).toBe(0)
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
      mockFrom(chain)

      await listInternalExamAttempts({ studentId: 'stu-2' })

      const eqCalls = chain.eq?.mock.calls ?? []
      expect(
        eqCalls.filter(([column, value]) => column === 'student_id' && value === 'stu-2'),
      ).toHaveLength(2)
    })

    it('scopes the query to a single subject when subjectId is set', async () => {
      mockAdmin()
      const chain = buildChain([makeRow()], null, 1)
      mockFrom(chain)

      await listInternalExamAttempts({ subjectId: 'sub-1' })

      const eqCalls = chain.eq?.mock.calls ?? []
      expect(
        eqCalls.filter(([column, value]) => column === 'subject_id' && value === 'sub-1'),
      ).toHaveLength(2)
    })

    it("restricts results to the caller's own organization", async () => {
      mockAdmin()
      const chain = buildChain([makeRow()], null, 1)
      mockFrom(chain)

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
      mockFrom(chain)

      const result = await listInternalExamAttempts({ page: 1 })

      expect(result.totalCount).toBe(40)
      expect(chain.range).toHaveBeenCalledWith(0, 24)
    })

    it('returns the second page of results when page=2 is set', async () => {
      mockAdmin()
      const chain = buildChain([makeRow(1)], null, 40)
      mockFrom(chain)

      await listInternalExamAttempts({ page: 2 })

      expect(chain.range).toHaveBeenCalledWith(25, 49)
    })

    it('returns an empty page without querying rows when there are no attempts', async () => {
      mockAdmin()
      const chain = buildChain([], null, 0)
      mockFrom(chain)

      const result = await listInternalExamAttempts()

      expect(result.rows).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect(chain.range).not.toHaveBeenCalled()
    })

    it('returns the last page of rows when the requested page is past the end', async () => {
      mockAdmin()
      // count=40 → totalPages=2; page=99 snaps to page 2 → range(25, 49).
      const chain = buildChain([makeRow(1)], null, 40)
      mockFrom(chain)

      const result = await listInternalExamAttempts({ page: 99 })

      expect(result.rows).toHaveLength(1)
      expect(result.totalCount).toBe(40)
      expect(chain.range).toHaveBeenCalledWith(25, 49)
    })

    it('returns an empty rows array when the rows query yields null data', async () => {
      mockAdmin()
      // Count reports rows exist, but the data query returns null (e.g. transport quirk).
      mockFrom([buildChain([], null, 5), buildChain(null, null, 5)])

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
        mockFrom(buildChain(null, { message: 'attempts count error' }))

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
        mockFrom([buildChain([], null, 5), buildChain(null, { message: 'attempts rows error' })])

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

    it('throws a sanitized message and logs the raw error when the item-count query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
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
          easa_subjects: null,
          users: null,
          internal_exam_codes: null,
        }
        mockFrom(
          buildChain([row], null, 1),
          buildChain(null, { message: 'item count error' }, null),
        )

        await expect(listInternalExamAttempts()).rejects.toThrow(
          'Failed to load internal exam attempts',
        )
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[listInternalExamAttempts] item count error:',
          'item count error',
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
      mockFrom(buildChain([row], null, 1))

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
      mockFrom(buildChain([row], null, 1))

      const result = await listInternalExamAttempts()

      expect(result.rows[0]!.scorePercentage).toBeNull()
    })
  })
})
