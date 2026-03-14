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

import { deleteDraft } from './draft-delete'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-000000000001'
const DRAFT_ID = '00000000-0000-0000-0000-000000000050'

// ---- Helpers --------------------------------------------------------------

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

function mockChain() {
  const chain: Record<string, unknown> = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
  for (const key of ['delete', 'eq']) {
    ;(chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- deleteDraft -----------------------------------------------------------

describe('deleteDraft', () => {
  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
  })

  it('returns failure when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
  })

  it('returns failure when draftId is not a valid UUID', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await deleteDraft({ draftId: 'not-a-uuid' })
    expect(result).toEqual({ success: false })
    consoleSpy.mockRestore()
  })

  it('returns success on happy path', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi.fn().mockReturnValue({ error: null })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue({ eq: secondEq })
    mockFrom.mockReturnValue(chain)

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: true })
  })

  it('returns failure when the database delete fails', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi.fn().mockReturnValue({ error: { message: 'RLS policy violation' } })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue({ eq: secondEq })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith('[deleteDraft] Delete error:', 'RLS policy violation')
    consoleSpy.mockRestore()
  })

  it('returns failure when an unexpected error occurs', async () => {
    setupAuthenticatedUser()
    mockFrom.mockImplementation(() => {
      throw new Error('connection lost')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
    consoleSpy.mockRestore()
  })

  it('scopes deletion to the authenticated user via student_id filter', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi.fn().mockReturnValue({ error: null })
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockImplementation(firstEq)
    mockFrom.mockReturnValue(chain)

    await deleteDraft({ draftId: DRAFT_ID })

    // First eq filters by 'id', second eq must filter by 'student_id'
    expect(firstEq).toHaveBeenCalledWith('id', DRAFT_ID)
    expect(secondEq).toHaveBeenCalledWith('student_id', USER_ID)
  })
})
