import { redirect } from 'next/navigation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockGetSessionUser, mockFrom } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
  }),
}))

// ---- Subject under test ----------------------------------------------------

import { FLAG_FETCH_TIMEOUT_MS } from '@/lib/constants/flag-fetch-timeout'
import { getFlaggedQuestionIds, getFlaggedQuestionIdsBounded } from './flagged-questions'

// ---- Helpers ---------------------------------------------------------------

/** Builds a fluent Supabase chain that resolves to the given return value. */
function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const proxy = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => proxy
    },
  })
  return proxy
}

// ---- Fixtures --------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID_A = '00000000-0000-4000-a000-000000000011'
const QUESTION_ID_B = '00000000-0000-4000-a000-000000000022'

function setupAuthenticatedUser() {
  mockGetSessionUser.mockResolvedValue({ id: USER_ID })
}

// ---- Tests -----------------------------------------------------------------

describe('getFlaggedQuestionIds', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns an empty array without querying when no question IDs are given', async () => {
    setupAuthenticatedUser()
    const result = await getFlaggedQuestionIds([])
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns an empty array when the user is not authenticated', async () => {
    mockGetSessionUser.mockResolvedValue(null)
    const result = await getFlaggedQuestionIds([QUESTION_ID_A])
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns the flagged question IDs from the active_flagged_questions view', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [{ question_id: QUESTION_ID_A }], error: null }))
    const result = await getFlaggedQuestionIds([QUESTION_ID_A, QUESTION_ID_B])
    expect(mockFrom).toHaveBeenCalledWith('active_flagged_questions')
    expect(result).toEqual([QUESTION_ID_A])
  })

  it('returns an empty array when none of the questions are flagged', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))
    const result = await getFlaggedQuestionIds([QUESTION_ID_A, QUESTION_ID_B])
    expect(result).toEqual([])
  })

  it('degrades to an empty array and logs when the query errors', async () => {
    setupAuthenticatedUser()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'boom' } }))
    const result = await getFlaggedQuestionIds([QUESTION_ID_A])
    expect(result).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith('[getFlaggedQuestionIds] Query error:', 'boom')
    errorSpy.mockRestore()
  })
})

describe('getFlaggedQuestionIdsBounded', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the flagged question IDs when the read succeeds', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [{ question_id: QUESTION_ID_A }], error: null }))
    expect(await getFlaggedQuestionIdsBounded([QUESTION_ID_A, QUESTION_ID_B])).toEqual([
      QUESTION_ID_A,
    ])
  })

  it('resolves to an empty array when the read throws', async () => {
    mockGetSessionUser.mockRejectedValue(new Error('cookie read failed'))
    expect(await getFlaggedQuestionIdsBounded([QUESTION_ID_A])).toEqual([])
  })

  it('resolves to an empty array when the query rejects', async () => {
    setupAuthenticatedUser()
    mockFrom.mockImplementation(() => {
      throw new Error('connection reset')
    })
    expect(await getFlaggedQuestionIdsBounded([QUESTION_ID_A])).toEqual([])
  })

  it('resolves to an empty array once the timeout passes on a hanging read', async () => {
    vi.useFakeTimers()
    mockGetSessionUser.mockReturnValue(new Promise(() => {}))

    const pending = getFlaggedQuestionIdsBounded([QUESTION_ID_A])
    await vi.advanceTimersByTimeAsync(FLAG_FETCH_TIMEOUT_MS)

    expect(await pending).toEqual([])
  })

  it('logs "read failed" and resolves to [] when the read rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockRejectedValue(new Error('cookie read failed'))

    expect(await getFlaggedQuestionIdsBounded([QUESTION_ID_A])).toEqual([])

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('read failed')
    expect(errorSpy.mock.calls[0]?.[1]).toBe('cookie read failed')
  })

  it('logs "timed out after <ms>" and resolves to [] when the read hangs', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockReturnValue(new Promise(() => {}))

    const pending = getFlaggedQuestionIdsBounded([QUESTION_ID_A])
    await vi.advanceTimersByTimeAsync(FLAG_FETCH_TIMEOUT_MS)

    expect(await pending).toEqual([])
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain(
      `timed out after ${FLAG_FETCH_TIMEOUT_MS}ms`,
    )
    expect(String(errorSpy.mock.calls[0]?.[0])).not.toContain('read failed')
  })

  it('logs nothing when the read succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [{ question_id: QUESTION_ID_A }], error: null }))

    expect(await getFlaggedQuestionIdsBounded([QUESTION_ID_A])).toEqual([QUESTION_ID_A])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('resolves to [] and logs "read failed" when the read rejects with a redirect error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let redirectError: unknown
    try {
      redirect('/login')
    } catch (e) {
      redirectError = e
    }
    mockGetSessionUser.mockRejectedValue(redirectError)

    await expect(getFlaggedQuestionIdsBounded([QUESTION_ID_A])).resolves.toEqual([])
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('read failed')
  })
})
