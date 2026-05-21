import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { listAvailableInternalExams, listMyInternalExamHistory } from './queries'

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
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns mapped rows omitting the code value', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'code-1',
          subject_id: 'sub-1',
          subject_name: 'Air Law',
          subject_short: 'ALW',
          expires_at: '2026-05-01T12:00:00.000Z',
          issued_at: '2026-04-29T12:00:00.000Z',
        },
      ],
      error: null,
    })

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
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'code-1',
          // Even if a future RPC change leaks `code` into the returned row,
          // the mapper must not expose it.
          code: 'SECRET-XYZ',
          subject_id: 'sub-1',
          subject_name: 'Air Law',
          subject_short: 'ALW',
          expires_at: '2026-05-01T12:00:00.000Z',
          issued_at: '2026-04-29T12:00:00.000Z',
        },
      ],
      error: null,
    })

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

  it('loads active codes via the list_my_active_internal_exam_codes RPC', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await listAvailableInternalExams()
    expect(mockRpc).toHaveBeenCalledWith('list_my_active_internal_exam_codes', {})
  })

  it('falls back to "Unknown subject" when subject_name is empty', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'code-2',
          subject_id: 'sub-2',
          subject_name: '',
          subject_short: '',
          expires_at: '2026-05-01T12:00:00.000Z',
          issued_at: '2026-04-29T12:00:00.000Z',
        },
      ],
      error: null,
    })

    const result = await listAvailableInternalExams()
    expect(result[0]?.subjectName).toBe('Unknown subject')
    expect(result[0]?.subjectShort).toBe('')
  })

  it('returns an empty array on RPC error and logs', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
      const result = await listAvailableInternalExams()
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('[listAvailableInternalExams] Query error:', 'boom')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('returns an empty array when data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
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
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('passes through sessions in the order and attempt numbers returned by the RPC', async () => {
    // The RPC returns rows already sorted newest-first with attempt_number
    // computed per subject (1 = oldest). The TS layer only renames keys.
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'sess-3',
          subject_id: 'sub-A',
          subject_name: 'Air Law',
          subject_short: 'ALW',
          started_at: '2026-04-29T15:00:00.000Z',
          ended_at: '2026-04-29T16:00:00.000Z',
          score_percentage: 80,
          passed: true,
          total_questions: 10,
          answered_count: 2,
          attempt_number: 2,
        },
        {
          id: 'sess-2',
          subject_id: 'sub-B',
          subject_name: 'Met',
          subject_short: 'MET',
          started_at: '2026-04-28T15:00:00.000Z',
          ended_at: '2026-04-28T16:00:00.000Z',
          score_percentage: 60,
          passed: false,
          total_questions: 10,
          answered_count: 1,
          attempt_number: 1,
        },
        {
          id: 'sess-1',
          subject_id: 'sub-A',
          subject_name: 'Air Law',
          subject_short: 'ALW',
          started_at: '2026-04-27T15:00:00.000Z',
          ended_at: '2026-04-27T16:00:00.000Z',
          score_percentage: 50,
          passed: false,
          total_questions: 10,
          answered_count: 3,
          attempt_number: 1,
        },
      ],
      error: null,
    })

    const result = await listMyInternalExamHistory()

    expect(result.map((r) => r.id)).toEqual(['sess-3', 'sess-2', 'sess-1'])
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

  it('preserves answeredCount=0 when the RPC returns zero answers for a session', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'sess-x',
          subject_id: 'sub-x',
          subject_name: 'X',
          subject_short: 'X',
          started_at: '2026-04-29T15:00:00.000Z',
          ended_at: null,
          score_percentage: null,
          passed: null,
          total_questions: 10,
          answered_count: 0,
          attempt_number: 1,
        },
      ],
      error: null,
    })

    const result = await listMyInternalExamHistory()
    expect(result).toHaveLength(1)
    expect(result[0]?.answeredCount).toBe(0)
    expect(result[0]?.passed).toBe(null)
  })

  it('returns an empty array when no internal exam sessions exist', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await listMyInternalExamHistory()
    expect(result).toEqual([])
  })

  it('returns an empty array on RPC error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
      const result = await listMyInternalExamHistory()
      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('[listMyInternalExamHistory] Query error:', 'boom')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('loads history via the list_my_internal_exam_history RPC', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await listMyInternalExamHistory()
    expect(mockRpc).toHaveBeenCalledWith('list_my_internal_exam_history', {})
  })

  it('falls back to "Unknown subject" when subject_name is empty', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'sess-y',
          subject_id: 'sub-y',
          subject_name: '',
          subject_short: '',
          started_at: '2026-04-29T15:00:00.000Z',
          ended_at: '2026-04-29T16:00:00.000Z',
          score_percentage: 75,
          passed: true,
          total_questions: 10,
          answered_count: 5,
          attempt_number: 1,
        },
      ],
      error: null,
    })

    const result = await listMyInternalExamHistory()
    expect(result[0]?.subjectName).toBe('Unknown subject')
    expect(result[0]?.subjectShort).toBe('')
  })

  it('returns an empty array when data is null and there is no error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await listMyInternalExamHistory()
    expect(result).toEqual([])
  })

  it('defaults attemptNumber to 1 when the RPC returns 0 for attempt_number', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'sess-z',
          subject_id: 'sub-z',
          subject_name: 'Air Law',
          subject_short: 'ALW',
          started_at: '2026-04-29T15:00:00.000Z',
          ended_at: null,
          score_percentage: null,
          passed: null,
          total_questions: 10,
          answered_count: 0,
          attempt_number: 0,
        },
      ],
      error: null,
    })

    const result = await listMyInternalExamHistory()
    // asNumber(0) returns 0, then || 1 coerces to 1
    expect(result[0]?.attemptNumber).toBe(1)
  })
})
