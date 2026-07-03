import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { startOralExam } from './start-oral-exam'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const USER_ID = '00000000-0000-4000-a000-000000000002'

const RPC_SUCCESS = {
  session_id: SESSION_ID,
  status: 'active',
  sections: [
    { section_no: 1, type: 'reading' },
    { section_no: 2, type: 'listening' },
  ],
  started_at: '2026-07-02T10:00:00Z',
  mode: 'practice',
}

// ---- Setup ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

function setupAuth({
  user = { id: USER_ID },
  error = null,
}: {
  user?: { id: string } | null
  error?: { message: string } | null
} = {}) {
  mockGetUser.mockResolvedValue({ data: { user }, error })
}

// ---- Tests ----------------------------------------------------------------

describe('startOralExam', () => {
  it('returns failure when the user is not authenticated', async () => {
    setupAuth({ user: null })
    const result = await startOralExam('practice')
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns failure when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    const result = await startOralExam('practice')
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns a specific message when another oral exam is already active', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_oral_exam_active' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startOralExam('practice')
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'You already have an oral exam in progress.' })
  })

  it('returns an account-inactive message when the student account is soft-deleted', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found_or_inactive' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startOralExam('practice')
    consoleSpy.mockRestore()
    expect(result).toEqual({
      success: false,
      error: 'Your account is inactive. Please contact your administrator.',
    })
  })

  it('returns a generic error when the RPC fails for an unrecognised reason', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'database_error' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startOralExam('practice')
    consoleSpy.mockRestore()
    expect(result).toEqual({
      success: false,
      error: 'Failed to start oral exam. Please try again.',
    })
  })

  it('returns a generic error when the RPC returns no data', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startOralExam('practice')
    consoleSpy.mockRestore()
    expect(result).toEqual({
      success: false,
      error: 'Failed to start oral exam. Please try again.',
    })
  })

  it('returns a generic error when an unexpected exception is thrown', async () => {
    setupAuth()
    mockRpc.mockRejectedValue(new Error('network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startOralExam('practice')
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
  })

  it('returns session data with camelCase field names on success', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS, error: null })
    const result = await startOralExam('practice')
    expect(result).toEqual({
      success: true,
      sessionId: SESSION_ID,
      status: 'active',
      sections: [
        { sectionNo: 1, type: 'reading' },
        { sectionNo: 2, type: 'listening' },
      ],
      startedAt: '2026-07-02T10:00:00Z',
      mode: 'practice',
    })
  })

  it('calls start_oral_exam_session with the caller-selected mode', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS, error: null })
    await startOralExam('mock')
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'start_oral_exam_session', {
      p_mode: 'mock',
    })
  })

  it('returns an invalid-mode error without calling the RPC when the mode is not recognised', async () => {
    const result = await startOralExam('bogus')
    expect(result).toEqual({ success: false, error: 'Invalid mode' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns an empty sections array when the RPC returns a non-array value for sections', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: { ...RPC_SUCCESS, sections: null }, error: null })
    const result = await startOralExam('practice')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sections).toEqual([])
  })

  it('normalizes malformed section numbers and types from the server response', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({
      data: { ...RPC_SUCCESS, sections: [{ section_no: '3', type: 42 }] },
      error: null,
    })
    const result = await startOralExam('practice')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sections).toEqual([{ sectionNo: 3, type: '42' }])
  })
})
