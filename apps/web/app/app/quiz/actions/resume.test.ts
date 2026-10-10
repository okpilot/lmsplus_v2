import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc, mockLoad, mockHeal, mockFinish } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockLoad: vi.fn(),
  mockHeal: vi.fn(),
  mockFinish: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
vi.mock('@/lib/supabase-rpc', () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }))
vi.mock('./resume-helpers', () => ({ loadResumeContext: (...a: unknown[]) => mockLoad(...a) }))
vi.mock('./draft-helpers', () => ({
  closePracticeSessionForDraft: (...a: unknown[]) => mockHeal(...a),
}))
vi.mock('./resume-seed', () => ({ finishResume: (...a: unknown[]) => mockFinish(...a) }))

import { resumeQuizSession } from './resume'

const DRAFT = '00000000-0000-4000-a000-000000000050'
const USER = '00000000-0000-4000-a000-000000000001'
const NEW_SESSION = '00000000-0000-4000-a000-000000000077'
const Q1 = '00000000-0000-4000-a000-000000000011'

const CTX = {
  oldSessionId: 'old',
  questionIds: [Q1],
  mode: 'quick_quiz',
  subjectId: 's1',
  topicId: null,
  answers: {},
  currentIndex: 0,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  mockLoad.mockResolvedValue({ ok: true, ctx: CTX })
  mockRpc.mockResolvedValue({ data: NEW_SESSION, error: null })
  mockFinish.mockResolvedValue(true)
})

describe('resumeQuizSession', () => {
  it('returns the new session and its questions after a clean seed', async () => {
    expect(await resumeQuizSession({ draftId: DRAFT })).toEqual({
      success: true,
      sessionId: NEW_SESSION,
      questionIds: [Q1],
    })
    expect(mockFinish).toHaveBeenCalledWith(
      expect.anything(),
      { draftId: DRAFT, userId: USER, sessionId: NEW_SESSION },
      CTX,
    )
  })

  it('fails with a generic message and no sessionId when seeding fails', async () => {
    mockFinish.mockResolvedValue(false)
    const result = await resumeQuizSession({ draftId: DRAFT })
    expect(result).toEqual({ success: false, error: expect.any(String) })
    expect(result).not.toHaveProperty('sessionId')
  })

  it('does not seed when the session could not be minted', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    expect(await resumeQuizSession({ draftId: DRAFT })).toEqual({
      success: false,
      error: expect.stringMatching(/active session/i),
    })
    expect(mockFinish).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await resumeQuizSession({ draftId: DRAFT })).toEqual({
      success: false,
      error: 'Not authenticated',
    })
  })

  it('rejects a non-uuid draft id', async () => {
    expect(await resumeQuizSession({ draftId: 'nope' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('returns the load error when the draft cannot be resumed', async () => {
    mockLoad.mockResolvedValue({ ok: false, error: 'Saved quiz not found.' })
    expect(await resumeQuizSession({ draftId: DRAFT })).toEqual({
      success: false,
      error: 'Saved quiz not found.',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
