import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockVerifySessionUser, mockFrom } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockFrom: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({ from: mockFrom }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

// ---- Subject under test ---------------------------------------------------

import { deleteDraft } from './draft-delete'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const DRAFT_ID = '00000000-0000-4000-a000-000000000050'

// ---- Helpers --------------------------------------------------------------

function setupAuthenticatedUser() {
  mockVerifySessionUser.mockResolvedValue({ id: USER_ID, email: null })
}

function setupUnauthenticated() {
  mockVerifySessionUser.mockResolvedValue(null)
}

function selectRows(result: unknown) {
  return vi.fn().mockResolvedValue(result)
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
  it('returns failure when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
  })

  it('returns failure when draftId is not a valid UUID', async () => {
    setupAuthenticatedUser()
    const result = await deleteDraft({ draftId: 'not-a-uuid' })
    expect(result).toEqual({ success: false })
  })

  it('returns failure when raw input is null (missing draftId)', async () => {
    setupAuthenticatedUser()
    const result = await deleteDraft(null)
    expect(result).toEqual({ success: false })
  })

  it('returns failure when raw input is missing draftId key', async () => {
    setupAuthenticatedUser()
    const result = await deleteDraft({})
    expect(result).toEqual({ success: false })
  })

  it('returns success on happy path', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi
      .fn()
      .mockReturnValue({ select: selectRows({ data: [{ id: DRAFT_ID }], error: null }) })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue({ eq: secondEq })
    mockFrom.mockReturnValue(chain)

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: true })
  })

  it('returns failure when the database delete fails', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi.fn().mockReturnValue({
      select: selectRows({ data: null, error: { message: 'RLS policy violation' } }),
    })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue({ eq: secondEq })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith('[deleteDraft] Delete error:', 'RLS policy violation')
    consoleSpy.mockRestore()
  })

  it('returns failure and logs when the delete changes no rows', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi.fn().mockReturnValue({ select: selectRows({ data: [], error: null }) })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue({ eq: secondEq })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith('[deleteDraft] No row deleted')
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
    const secondEq = vi
      .fn()
      .mockReturnValue({ select: selectRows({ data: [{ id: DRAFT_ID }], error: null }) })
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockImplementation(firstEq)
    mockFrom.mockReturnValue(chain)

    await deleteDraft({ draftId: DRAFT_ID })

    // First eq filters by 'id', second eq must filter by 'student_id'
    expect(firstEq).toHaveBeenCalledWith('id', DRAFT_ID)
    expect(secondEq).toHaveBeenCalledWith('student_id', USER_ID)
  })
})
