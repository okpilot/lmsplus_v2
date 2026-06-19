import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
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

// ---- Subject under test ---------------------------------------------------

import { getActiveVfrRtSession, getVfrRtSubject } from './vfr-rt-exam'

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
