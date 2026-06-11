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

import { getFlaggedQuestionIds } from './flagged-questions'

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
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
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
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await getFlaggedQuestionIds([QUESTION_ID_A])
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns an empty array when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })
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
