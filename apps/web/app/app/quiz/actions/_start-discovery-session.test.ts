import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({}),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ----------------------------------------------------

import { createDiscoverySession, mapDiscoveryStartError } from './_start-discovery-session'

// ---- Fixtures --------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const CREATED_ID = '00000000-0000-4000-a000-0000000000ff'
const IDS = ['00000000-0000-4000-a000-000000000011']

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests -----------------------------------------------------------------

describe('mapDiscoveryStartError', () => {
  it('tells the user to finish their other session when one is already active', () => {
    expect(mapDiscoveryStartError('another_session_active')).toBe(
      'Finish or exit your active session first.',
    )
  })

  it('returns a generic message without leaking other validation tokens', () => {
    const message = mapDiscoveryStartError('too_many_questions')
    expect(message).toBe('Failed to start study session')
    expect(message).not.toContain('too_many_questions')
  })
})

describe('createDiscoverySession', () => {
  it('returns the created session id on success', async () => {
    mockRpc.mockResolvedValue({ data: CREATED_ID, error: null })
    const result = await createDiscoverySession(SUBJECT_ID, IDS)
    expect(result).toEqual({ id: CREATED_ID, error: null })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'start_discovery_session', {
      p_subject_id: SUBJECT_ID,
      p_question_ids: IDS,
    })
  })

  it('returns a sanitized error and no id when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    const result = await createDiscoverySession(SUBJECT_ID, IDS)
    expect(result).toEqual({ id: null, error: 'Finish or exit your active session first.' })
  })

  it('fails when the RPC succeeds but returns no session id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await createDiscoverySession(SUBJECT_ID, IDS)
    expect(result).toEqual({ id: null, error: 'Failed to start study session' })
  })

  it('fails when the RPC returns an empty-string session id', async () => {
    mockRpc.mockResolvedValue({ data: '', error: null })
    const result = await createDiscoverySession(SUBJECT_ID, IDS)
    expect(result).toEqual({ id: null, error: 'Failed to start study session' })
  })
})
