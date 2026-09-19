import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real `e2e/helpers/supabase.ts` throws at module-import time without
// SUPABASE_SERVICE_ROLE_KEY — mock it before importing the module under test.
// Same pattern as seed-unauth-fixtures.test.ts / seed-quiz.test.ts.

const mockFrom = vi.hoisted(() => vi.fn())
const mockCreateAuthenticatedClient = vi.hoisted(() => vi.fn())
const mockFetchActiveQuestionIds = vi.hoisted(() => vi.fn())
const mockBuildAnswersForSession = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('../../helpers/supabase', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('./seed-users', () => ({
  VICTIM_EMAIL: 'victim@test.com',
  VICTIM_PASSWORD: 'password123!',
}))

vi.mock('./redteam-client', () => ({
  createAuthenticatedClient: mockCreateAuthenticatedClient,
}))

vi.mock('./audit-helpers', () => ({
  fetchActiveQuestionIds: mockFetchActiveQuestionIds,
  buildAnswersForSession: mockBuildAnswersForSession,
}))

import type { getAdminClient } from '../../helpers/supabase'
import { createFixtureTracker, type FixtureTracker } from './cleanup'
import { seedVictimCompletedSession } from './seed-victim-session'

/** Forwards every chained method back to itself; resolves to `returnValue` when awaited. */
function buildChain(returnValue: unknown): unknown {
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

type AdminClient = ReturnType<typeof getAdminClient>
const adminMock = { from: mockFrom } as unknown as AdminClient
const IDS = { orgId: 'org-id', subjectId: 'subject-id', topicId: 'topic-id' }
const VICTIM_CLIENT = { rpc: mockRpc }

let tracker: FixtureTracker

function setupCommonMocks() {
  mockCreateAuthenticatedClient.mockResolvedValue(VICTIM_CLIENT)
  mockFetchActiveQuestionIds.mockResolvedValue(['question-id-1'])
  mockBuildAnswersForSession.mockResolvedValue([
    { question_id: 'question-id-1', selected_option_id: 'opt-1' },
  ])
}

beforeEach(() => {
  vi.resetAllMocks()
  tracker = createFixtureTracker()
})

describe('seedVictimCompletedSession', () => {
  it('returns the started session id and tracks it for cleanup', async () => {
    setupCommonMocks()
    mockRpc
      .mockResolvedValueOnce({ data: 'victim-session-id', error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    const sessionId = await seedVictimCompletedSession(adminMock, IDS, tracker)

    expect(sessionId).toBe('victim-session-id')
    expect(tracker.sessions.has('victim-session-id')).toBe(true)
  })

  it('throws when start_quiz_session RPC fails', async () => {
    setupCommonMocks()

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'start RPC error' } })

    await expect(seedVictimCompletedSession(adminMock, IDS, tracker)).rejects.toThrow(
      /start_quiz_session failed.*start RPC error/,
    )
  })

  it('throws when start_quiz_session returns a non-string id', async () => {
    setupCommonMocks()

    mockRpc.mockResolvedValueOnce({ data: 42, error: null }) // number, not string

    await expect(seedVictimCompletedSession(adminMock, IDS, tracker)).rejects.toThrow(
      /start_quiz_session failed.*non-string id/,
    )
  })

  it('throws when batch_submit_quiz RPC fails', async () => {
    setupCommonMocks()
    mockFrom.mockReturnValueOnce(buildChain({ data: [{ id: 'sess-ok' }], error: null })) // discard

    mockRpc
      .mockResolvedValueOnce({ data: 'sess-ok', error: null }) // start_quiz_session ok
      .mockResolvedValueOnce({ data: null, error: { message: 'submit RPC error' } })

    await expect(seedVictimCompletedSession(adminMock, IDS, tracker)).rejects.toThrow(
      /batch_submit_quiz failed.*submit RPC error/,
    )
  })

  it('discards the half-seeded session when batch_submit_quiz fails', async () => {
    setupCommonMocks()
    mockFrom.mockReturnValueOnce(buildChain({ data: [{ id: 'sess-ok' }], error: null })) // discard

    mockRpc
      .mockResolvedValueOnce({ data: 'sess-ok', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'submit RPC error' } })

    await expect(seedVictimCompletedSession(adminMock, IDS, tracker)).rejects.toThrow(
      /batch_submit_quiz failed/,
    )

    // The started session is left open otherwise, and the caller never receives
    // the tracker — every later run would then hit `another_session_active`.
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })

  it('surfaces the submit failure even when the discard itself errors', async () => {
    setupCommonMocks()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValueOnce(buildChain({ data: null, error: { message: 'discard failed' } }))

    mockRpc
      .mockResolvedValueOnce({ data: 'sess-ok', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'submit RPC error' } })

    await expect(seedVictimCompletedSession(adminMock, IDS, tracker)).rejects.toThrow(
      /batch_submit_quiz failed.*submit RPC error/,
    )
    expect(errorSpy).toHaveBeenCalled()
  })
})
