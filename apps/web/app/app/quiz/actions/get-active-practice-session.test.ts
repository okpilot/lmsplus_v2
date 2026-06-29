import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

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

// ---- Subject under test ----------------------------------------------------

import { getActivePracticeSession } from './get-active-practice-session'

// ---- Helpers ---------------------------------------------------------------

/** Builds a fluent Supabase chain that resolves to the given result. */
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

const PRACTICE_ROW = {
  id: 'sess-prac-001',
  mode: 'quick_quiz',
  subject_id: 'subj-aaa',
  started_at: '2026-04-27T10:00:00.000Z',
  easa_subjects: { name: 'Air Law', short: 'ALW' },
}

// ---- Lifecycle -------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
})

// ---- Tests -----------------------------------------------------------------

describe('getActivePracticeSession — unauthenticated', () => {
  it('returns not-authenticated when auth error is present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getActivePracticeSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns not-authenticated when user is null without auth error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getActivePracticeSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })
})

describe('getActivePracticeSession — happy path', () => {
  it('returns the active practice session with its subject details', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [PRACTICE_ROW], error: null }))

    const result = await getActivePracticeSession()

    expect(result).toEqual({
      success: true,
      session: {
        sessionId: 'sess-prac-001',
        mode: 'quick_quiz',
        subjectId: 'subj-aaa',
        subjectName: 'Air Law',
        subjectCode: 'ALW',
        startedAt: '2026-04-27T10:00:00.000Z',
      },
    })
  })

  it('preserves the smart_review mode on the returned session', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...PRACTICE_ROW, mode: 'smart_review' }], error: null }),
    )

    const result = await getActivePracticeSession()

    expect(result.success).toBe(true)
    if (result.success) expect(result.session?.mode).toBe('smart_review')
  })

  it('falls back to Unknown subject and empty code when easa_subjects is null', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...PRACTICE_ROW, easa_subjects: null }], error: null }),
    )

    const result = await getActivePracticeSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.session?.subjectName).toBe('Unknown subject')
      expect(result.session?.subjectCode).toBe('')
    }
  })

  it('returns a null session when no active practice session exists', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getActivePracticeSession()

    expect(result).toEqual({ success: true, session: null })
  })

  it('returns a null session when data is null', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    const result = await getActivePracticeSession()

    expect(result).toEqual({ success: true, session: null })
  })
})

describe('getActivePracticeSession — failure paths', () => {
  it('returns a generic error when the query fails', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: null, error: { message: 'relation does not exist' } }),
    )

    const result = await getActivePracticeSession()

    expect(result).toEqual({ success: false, error: 'Failed to fetch active practice session.' })
  })

  it('returns a generic error when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))

    const result = await getActivePracticeSession()

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
  })
})
