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
  error: { message: string; code?: string } | null = null,
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
 * each table to its own chain, or a `quiz_session_answers` call silently consumes a
 * `quiz_sessions` chain meant for the rows query.
 *
 * `sessionsChains` is consumed in call order for `quiz_sessions` — the last chain
 * supplied repeats for any further call, so a single chain (the common case) serves
 * both the count and the rows query, matching the old `mockReturnValue` behavior.
 *
 * `fetchAnsweredItemCounts` calls `.from('quiz_session_answers')` TWICE per invocation
 * — once for its own count read, then (only once that count is non-zero) for its page
 * read — as two INDEPENDENT chain instances. `answersChains` mirrors `sessionsChains`'s
 * call-order-array shape so the two phases can diverge: pass a single chain (the
 * default) to have both phases share one result, or a `[countChain, pageChain]` pair
 * to give them different outcomes — e.g. a successful count followed by a failing page
 * read. The single-chain default (`count: 0`) still matters for tests that don't care
 * about item counts — `fetchAllRows` treats a `null` count as a failed "no exact count"
 * read, not an empty table, and would surface that as an error here.
 */
function mockFrom(
  sessionsChains: ChainMock | ChainMock[],
  answersChains: ChainMock | ChainMock[] = buildChain([], null, 0),
) {
  const chains = Array.isArray(sessionsChains) ? sessionsChains : [sessionsChains]
  const answerChains = Array.isArray(answersChains) ? answersChains : [answersChains]
  let callIndex = 0
  let answerCallIndex = 0
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'quiz_session_answers') {
      const chain = answerChains[Math.min(answerCallIndex, answerChains.length - 1)]
      answerCallIndex += 1
      return chain
    }
    // Throw rather than fall through: without this, a query retargeted to ANY other table
    // would silently receive the quiz_sessions chain and the test would still pass. Mirrors
    // the sibling dispatcher in students/[id]/queries.test.ts.
    if (table !== 'quiz_sessions') {
      throw new Error(`Unexpected table queried in test: ${table}`)
    }
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
      ).toHaveLength(1)
    })

    it('scopes the query to a single subject when subjectId is set', async () => {
      mockAdmin()
      const chain = buildChain([makeRow()], null, 1)
      mockFrom(chain)

      await listInternalExamAttempts({ subjectId: 'sub-1' })

      const eqCalls = chain.eq?.mock.calls ?? []
      expect(
        eqCalls.filter(([column, value]) => column === 'subject_id' && value === 'sub-1'),
      ).toHaveLength(1)
    })

    it("restricts results to the caller's own organization", async () => {
      mockAdmin()
      const chain = buildChain([makeRow()], null, 1)
      mockFrom(chain)

      await listInternalExamAttempts({})

      // The single page query must carry it: if the org filter is dropped,
      // an admin sees another organization's data.
      const eqCalls = chain.eq?.mock.calls ?? []
      expect(
        eqCalls.filter(([column, value]) => column === 'organization_id' && value === ORG_ID),
      ).toHaveLength(1)
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

    it('returns an empty page without querying item counts when there are no attempts', async () => {
      mockAdmin()
      const chain = buildChain([], null, 0)
      mockFrom(chain)

      const result = await listInternalExamAttempts()

      expect(result.rows).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect(mockAdminFrom).not.toHaveBeenCalledWith('quiz_session_answers')
    })

    it('returns the last page of rows when the requested page is past the end', async () => {
      mockAdmin()
      // First query fails PGRST103; count=40 → totalPages=2; page=99 snaps to page 2 → range(25, 49).
      const pastEnd = { message: 'range', code: 'PGRST103' }
      const lastPage = buildChain([makeRow(1)], null, 40)
      mockFrom([buildChain(null, pastEnd, null), buildChain([], null, 40), lastPage])

      const result = await listInternalExamAttempts({ page: 99 })

      expect(result.rows).toHaveLength(1)
      expect(result.totalCount).toBe(40)
      expect(lastPage.range).toHaveBeenCalledWith(25, 49)
    })

    it("keeps the past-end recount and re-read within the caller's organization", async () => {
      mockAdmin()
      const chains = [
        buildChain(null, { message: 'range', code: 'PGRST103' }, null),
        buildChain(null, null, 40),
        buildChain([makeRow(1)], null, 40),
      ]
      mockFrom(chains)

      const result = await listInternalExamAttempts({ page: 99 })

      expect(result.rows).toHaveLength(1)
      for (const chain of chains) {
        const orgCalls = (chain.eq?.mock.calls ?? []).filter(
          ([column]) => column === 'organization_id',
        )
        expect(orgCalls).toEqual([['organization_id', ORG_ID]])
      }
    })

    it('snaps to the last page when the offset equals the total (empty page, count > 0)', async () => {
      mockAdmin()
      // 50 rows, page 3 → offset 50 == total: 200 with [] and count 50, no error.
      const lastPage = buildChain([makeRow(1)], null, 50)
      mockFrom([buildChain([], null, 50), buildChain([], null, 50), lastPage])

      const result = await listInternalExamAttempts({ page: 3 })

      expect(result.rows).toHaveLength(1)
      expect(result.totalCount).toBe(50)
      expect(lastPage.range).toHaveBeenCalledWith(25, 49)
    })

    it('returns an empty rows array when the rows query yields null data', async () => {
      mockAdmin()
      // Count reports rows exist, but the data query returns null (e.g. transport quirk).
      mockFrom([buildChain(null, null, 5), buildChain(null, null, 5)])

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
        mockFrom([
          buildChain(null, { message: 'range', code: 'PGRST103' }, null),
          buildChain(null, { message: 'attempts count error' }),
        ])

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
        mockFrom(buildChain(null, { message: 'attempts rows error' }))

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

    it('throws when the item-count page fetch fails after a successful count', async () => {
      // The item count already reported 1 row, so a page-fetch failure after it must not
      // be masked as a partial/short result — code-style.md §7 "Paginated Fetch Needs a
      // Caller-Level Page-Error Test": a truncated count must never look complete.
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
        mockFrom(buildChain([row], null, 1), [
          buildChain(null, null, 1),
          buildChain(null, { message: 'item page error' }, null),
        ])

        await expect(listInternalExamAttempts()).rejects.toThrow(
          'Failed to load internal exam attempts',
        )
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[listInternalExamAttempts] item count error:',
          'item page error',
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

describe('listInternalExamAttempts single-query pagination', () => {
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
  const pastEnd = { message: 'Requested range not satisfiable', code: 'PGRST103' }

  function sessionCalls() {
    return mockAdminFrom.mock.calls.filter(([t]) => t === 'quiz_sessions')
  }

  it('reads an in-range page with one attempts query that carries the exact count', async () => {
    mockAdmin()
    const chain = buildChain([row], null, 40)
    mockFrom(chain)

    const result = await listInternalExamAttempts({ page: 1 })

    expect(sessionCalls()).toHaveLength(1)
    expect(chain.select?.mock.calls[0]?.[1]).toMatchObject({ count: 'exact' })
    expect(chain.select?.mock.calls[0]?.[1]).not.toMatchObject({ head: true })
    expect(result.totalCount).toBe(40)
    expect(result.rows).toHaveLength(1)
  })

  it('snaps to the last page without throwing when the requested page is past the end', async () => {
    mockAdmin()
    const failing = buildChain(null, pastEnd, null)
    const counting = buildChain([], null, 40)
    const lastPage = buildChain([row], null, 40)
    mockFrom([failing, counting, lastPage])

    const result = await listInternalExamAttempts({ page: 99 })

    expect(result.totalCount).toBe(40)
    expect(result.rows).toHaveLength(1)
    expect(lastPage.range).toHaveBeenCalledWith(25, 49)
  })

  it('snaps to the last page when the offset equals the total (empty page, count > 0)', async () => {
    mockAdmin()
    const lastPage = buildChain([row], null, 25)
    mockFrom([buildChain([], null, 25), buildChain([], null, 25), lastPage])

    const result = await listInternalExamAttempts({ page: 2 })

    expect(result.totalCount).toBe(25)
    expect(result.rows).toHaveLength(1)
    expect(lastPage.range).toHaveBeenCalledWith(0, 24)
  })

  it('returns empty rows with the recount total when the re-read is also past the end', async () => {
    mockAdmin()
    mockFrom([
      buildChain(null, pastEnd, null),
      buildChain([], null, 40),
      buildChain(null, pastEnd, null),
    ])

    const result = await listInternalExamAttempts({ page: 99 })

    expect(result).toEqual({ rows: [], totalCount: 40 })
  })

  it('reads page 2 after a concurrent insert grows the total', async () => {
    mockAdmin()
    const lastPage = buildChain([row], null, 60)
    mockFrom([buildChain([], null, 25), buildChain([], null, 60), lastPage])

    const result = await listInternalExamAttempts({ page: 2 })

    expect(result.totalCount).toBe(60)
    expect(result.rows).toHaveLength(1)
    expect(lastPage.range).toHaveBeenCalledWith(25, 49)
  })

  it('throws the generic message when the last-page re-read fails after a successful count', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockAdmin()
      mockFrom([
        buildChain(null, pastEnd, null),
        buildChain([], null, 40),
        buildChain(null, { message: 're-read failed' }, null),
      ])

      await expect(listInternalExamAttempts({ page: 99 })).rejects.toThrow(
        'Failed to load internal exam attempts',
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[listInternalExamAttempts] DB error:',
        're-read failed',
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('throws the generic message and logs when the attempts query fails with another error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockAdmin()
      mockFrom(buildChain(null, { message: 'boom', code: '57014' }, null))

      await expect(listInternalExamAttempts({ page: 1 })).rejects.toThrow(
        'Failed to load internal exam attempts',
      )
      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(sessionCalls()).toHaveLength(1)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
