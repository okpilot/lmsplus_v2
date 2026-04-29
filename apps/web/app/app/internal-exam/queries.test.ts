import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { listAvailableInternalExams, listMyInternalExamHistory } from './queries'

// ---- Helpers --------------------------------------------------------------

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

function mockFromSequence(...returnValues: unknown[]) {
  let i = 0
  mockFrom.mockImplementation(() => {
    const v = returnValues[Math.min(i, returnValues.length - 1)]
    i++
    return buildChain(v)
  })
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
})

// ---- listAvailableInternalExams ------------------------------------------

describe('listAvailableInternalExams', () => {
  it('returns an empty array when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await listAvailableInternalExams()
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns mapped rows omitting the code value', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            id: 'code-1',
            subject_id: 'sub-1',
            expires_at: '2026-05-01T12:00:00.000Z',
            issued_at: '2026-04-29T12:00:00.000Z',
            easa_subjects: { name: 'Air Law', short: 'ALW' },
          },
        ],
        error: null,
      }),
    )

    const result = await listAvailableInternalExams()

    expect(result).toEqual([
      {
        id: 'code-1',
        subjectId: 'sub-1',
        subjectName: 'Air Law',
        subjectShort: 'ALW',
        expiresAt: '2026-05-01T12:00:00.000Z',
        issuedAt: '2026-04-29T12:00:00.000Z',
      },
    ])
    // Privileged: code value must never be on the returned objects
    for (const entry of result) {
      expect(Object.keys(entry)).not.toContain('code')
    }
  })

  it('NEVER returns the code value even if the row contains one (defense-in-depth)', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            id: 'code-1',
            // Even if a future schema change leaks `code` into the row, the
            // mapper must not expose it.
            code: 'SECRET-XYZ',
            subject_id: 'sub-1',
            expires_at: '2026-05-01T12:00:00.000Z',
            issued_at: '2026-04-29T12:00:00.000Z',
            easa_subjects: { name: 'Air Law', short: 'ALW' },
          },
        ],
        error: null,
      }),
    )

    const result = await listAvailableInternalExams()

    expect(result).toHaveLength(1)
    // The privileged code value must NOT appear anywhere in the serialized result.
    expect(JSON.stringify(result)).not.toContain('SECRET-XYZ')
    const entry = result[0]
    expect(entry).toBeDefined()
    if (!entry) return
    // The returned shape is fixed and intentionally omits `code`.
    expect(Object.keys(entry).sort()).toEqual(
      ['id', 'subjectId', 'subjectName', 'subjectShort', 'expiresAt', 'issuedAt'].sort(),
    )
  })

  it('queries the internal_exam_codes table', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))
    await listAvailableInternalExams()
    expect(mockFrom).toHaveBeenCalledWith('internal_exam_codes')
  })

  it('falls back to "Unknown subject" when easa_subjects is null', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            id: 'code-2',
            subject_id: 'sub-2',
            expires_at: '2026-05-01T12:00:00.000Z',
            issued_at: '2026-04-29T12:00:00.000Z',
            easa_subjects: null,
          },
        ],
        error: null,
      }),
    )

    const result = await listAvailableInternalExams()
    expect(result[0]?.subjectName).toBe('Unknown subject')
    expect(result[0]?.subjectShort).toBe('')
  })

  it('returns an empty array on query error and logs', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'boom' } }))
      const result = await listAvailableInternalExams()
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('[listAvailableInternalExams] Query error:', 'boom')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('returns an empty array when data is null', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))
    const result = await listAvailableInternalExams()
    expect(result).toEqual([])
  })
})

// ---- listMyInternalExamHistory --------------------------------------------

describe('listMyInternalExamHistory', () => {
  it('returns an empty array when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await listMyInternalExamHistory()
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns sessions sorted newest-first, with attemptNumber computed per subject (1=oldest)', async () => {
    mockFromSequence(
      {
        data: [
          // Newest first (already DESC). Two attempts on subject A, one on subject B.
          {
            id: 'sess-3',
            subject_id: 'sub-A',
            started_at: '2026-04-29T15:00:00.000Z',
            ended_at: '2026-04-29T16:00:00.000Z',
            score_percentage: 80,
            passed: true,
            total_questions: 10,
            easa_subjects: { name: 'Air Law', short: 'ALW' },
          },
          {
            id: 'sess-2',
            subject_id: 'sub-B',
            started_at: '2026-04-28T15:00:00.000Z',
            ended_at: '2026-04-28T16:00:00.000Z',
            score_percentage: 60,
            passed: false,
            total_questions: 10,
            easa_subjects: { name: 'Met', short: 'MET' },
          },
          {
            id: 'sess-1',
            subject_id: 'sub-A',
            started_at: '2026-04-27T15:00:00.000Z',
            ended_at: '2026-04-27T16:00:00.000Z',
            score_percentage: 50,
            passed: false,
            total_questions: 10,
            easa_subjects: { name: 'Air Law', short: 'ALW' },
          },
        ],
        error: null,
      },
      {
        data: [
          { session_id: 'sess-1' },
          { session_id: 'sess-1' },
          { session_id: 'sess-1' },
          { session_id: 'sess-2' },
          { session_id: 'sess-3' },
          { session_id: 'sess-3' },
        ],
        error: null,
      },
    )

    const result = await listMyInternalExamHistory()

    expect(result.map((r) => r.id)).toEqual(['sess-3', 'sess-2', 'sess-1'])
    // Attempt numbers: sess-1 is the oldest sub-A attempt → 1; sess-3 is the
    // newer sub-A attempt → 2; sess-2 is the only sub-B attempt → 1.
    const byId = new Map(result.map((r) => [r.id, r]))
    expect(byId.get('sess-1')?.attemptNumber).toBe(1)
    expect(byId.get('sess-3')?.attemptNumber).toBe(2)
    expect(byId.get('sess-2')?.attemptNumber).toBe(1)
    expect(byId.get('sess-1')?.answeredCount).toBe(3)
    expect(byId.get('sess-2')?.answeredCount).toBe(1)
    expect(byId.get('sess-3')?.answeredCount).toBe(2)
    expect(byId.get('sess-3')?.passed).toBe(true)
    expect(byId.get('sess-3')?.scorePercentage).toBe(80)
    expect(byId.get('sess-3')?.subjectName).toBe('Air Law')
    expect(byId.get('sess-3')?.subjectShort).toBe('ALW')
  })

  it('returns answeredCount=0 when no answers are returned for a session', async () => {
    mockFromSequence(
      {
        data: [
          {
            id: 'sess-x',
            subject_id: 'sub-x',
            started_at: '2026-04-29T15:00:00.000Z',
            ended_at: null,
            score_percentage: null,
            passed: null,
            total_questions: 10,
            easa_subjects: { name: 'X', short: 'X' },
          },
        ],
        error: null,
      },
      { data: [], error: null },
    )

    const result = await listMyInternalExamHistory()
    expect(result).toHaveLength(1)
    expect(result[0]?.answeredCount).toBe(0)
    expect(result[0]?.passed).toBe(null)
  })

  it('returns an empty array when no internal exam sessions exist', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))
    const result = await listMyInternalExamHistory()
    expect(result).toEqual([])
  })

  it('returns an empty array on session query error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'boom' } }))
      const result = await listMyInternalExamHistory()
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('[listMyInternalExamHistory] Query error:', 'boom')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('queries the quiz_sessions table first', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))
    await listMyInternalExamHistory()
    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })

  it('falls back to "Unknown subject" when easa_subjects is null', async () => {
    mockFromSequence(
      {
        data: [
          {
            id: 'sess-y',
            subject_id: 'sub-y',
            started_at: '2026-04-29T15:00:00.000Z',
            ended_at: '2026-04-29T16:00:00.000Z',
            score_percentage: 75,
            passed: true,
            total_questions: 10,
            easa_subjects: null,
          },
        ],
        error: null,
      },
      { data: [], error: null },
    )

    const result = await listMyInternalExamHistory()
    expect(result[0]?.subjectName).toBe('Unknown subject')
    expect(result[0]?.subjectShort).toBe('')
  })

  it('still returns sessions even when answers query errors (degrades gracefully)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mockFromSequence(
        {
          data: [
            {
              id: 'sess-z',
              subject_id: 'sub-z',
              started_at: '2026-04-29T15:00:00.000Z',
              ended_at: '2026-04-29T16:00:00.000Z',
              score_percentage: 80,
              passed: true,
              total_questions: 10,
              easa_subjects: { name: 'Z', short: 'Z' },
            },
          ],
          error: null,
        },
        { data: null, error: { message: 'answers boom' } },
      )

      const result = await listMyInternalExamHistory()
      expect(result).toHaveLength(1)
      expect(result[0]?.answeredCount).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[listMyInternalExamHistory] Answers query error:',
        'answers boom',
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
