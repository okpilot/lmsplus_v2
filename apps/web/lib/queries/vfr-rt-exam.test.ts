import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { getActiveVfrRtSession, getVfrRtInProgress, getVfrRtSubject } from './vfr-rt-exam'

// ---- Helpers --------------------------------------------------------------

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const terminalProxy = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => terminalProxy
    },
  })
  return terminalProxy
}

function mockFromSequence(...responses: unknown[]) {
  let call = 0
  mockFrom.mockImplementation(() => buildChain(responses[call++] ?? { data: null }))
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getVfrRtSubject
// ---------------------------------------------------------------------------

describe('getVfrRtSubject', () => {
  it('returns subject id and name when RT subject exists', async () => {
    mockFromSequence({ data: { id: 'subj-rt', name: 'VFR Radiotelephony' } })
    const result = await getVfrRtSubject()
    expect(result).toEqual({ id: 'subj-rt', name: 'VFR Radiotelephony' })
  })

  it('returns null when RT subject does not exist', async () => {
    mockFromSequence({ data: null })
    const result = await getVfrRtSubject()
    expect(result).toBeNull()
  })

  it('returns null and logs when query fails', async () => {
    mockFromSequence({ data: null, error: { message: 'relation not found' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtSubject()
    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('[getVfrRtSubject] Query error:', 'relation not found')
    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// getActiveVfrRtSession
// ---------------------------------------------------------------------------

describe('getActiveVfrRtSession', () => {
  it('returns sessionId when an active vfr_rt_exam session exists', async () => {
    mockFromSequence({ data: { id: 'sess-abc' } })
    const result = await getActiveVfrRtSession()
    expect(result).toEqual({ sessionId: 'sess-abc' })
  })

  it('returns null when no active session exists', async () => {
    mockFromSequence({ data: null })
    const result = await getActiveVfrRtSession()
    expect(result).toBeNull()
  })

  it('returns null without querying when no user session is present', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await getActiveVfrRtSession()
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns null and logs when auth returns an error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getActiveVfrRtSession()
    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getActiveVfrRtSession] Auth error:',
      'session expired',
    )
    expect(mockFrom).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('returns null and logs when query fails', async () => {
    mockFromSequence({ data: null, error: { message: 'connection refused' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getActiveVfrRtSession()
    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getActiveVfrRtSession] Query error:',
      'connection refused',
    )
    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// getVfrRtInProgress
// ---------------------------------------------------------------------------

describe('getVfrRtInProgress', () => {
  const activeRow = {
    id: 'sess-1',
    started_at: '2026-06-19T10:00:00.000Z',
    time_limit_seconds: 1800,
    ended_at: null,
  }
  const sampleQuestions = [
    {
      id: 'q-1',
      question_type: 'short_answer',
      question_text: 'What is QNH?',
      question_image_url: null,
      subject_code: 'RT',
      topic_code: 'RT.1',
      difficulty: 'easy',
      question_number: '1',
      options: null,
      dialog_template: null,
      blanks_safe: null,
    },
  ]

  it('returns not_found when no session row exists', async () => {
    mockFromSequence({ data: null })
    const result = await getVfrRtInProgress('sess-1')
    expect(result).toEqual({ status: 'not_found' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns completed without calling the RPC when ended_at is set', async () => {
    mockFromSequence({ data: { ...activeRow, ended_at: '2026-06-19T10:30:00.000Z' } })
    const result = await getVfrRtInProgress('sess-1')
    expect(result).toEqual({ status: 'completed' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns active with questions when the session is in progress', async () => {
    mockFromSequence({ data: activeRow })
    mockRpc.mockResolvedValueOnce({ data: sampleQuestions, error: null })
    const result = await getVfrRtInProgress('sess-1')
    expect(result).toEqual({
      status: 'active',
      sessionId: 'sess-1',
      startedAt: '2026-06-19T10:00:00.000Z',
      timeLimitSeconds: 1800,
      questions: sampleQuestions,
    })
  })

  it('returns not_found and logs when the questions RPC errors', async () => {
    mockFromSequence({ data: activeRow })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtInProgress('sess-1')
    expect(result).toEqual({ status: 'not_found' })
    expect(consoleSpy).toHaveBeenCalledWith('[getVfrRtInProgress] RPC error:', 'rpc failed')
    consoleSpy.mockRestore()
  })

  it('returns not_found and logs when the questions RPC returns an empty array', async () => {
    mockFromSequence({ data: activeRow })
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtInProgress('sess-1')
    expect(result).toEqual({ status: 'not_found' })
    expect(consoleSpy).toHaveBeenCalledWith('[getVfrRtInProgress] RPC returned no questions')
    consoleSpy.mockRestore()
  })

  it('returns not_found and logs when the session query fails', async () => {
    mockFromSequence({ data: null, error: { message: 'db unavailable' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtInProgress('sess-1')
    expect(result).toEqual({ status: 'not_found' })
    expect(consoleSpy).toHaveBeenCalledWith('[getVfrRtInProgress] Query error:', 'db unavailable')
    expect(mockRpc).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('returns not_found without querying the session when auth fails', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'expired' } })
    const result = await getVfrRtInProgress('sess-1')
    expect(result).toEqual({ status: 'not_found' })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
