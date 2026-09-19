import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Supabase admin-client mock — the real `e2e/helpers/supabase.ts` throws at
// module-import time if SUPABASE_SERVICE_ROLE_KEY isn't set (intended for
// live Playwright E2E runs, not jsdom unit tests). Mock the module BEFORE
// importing seed-unauth-fixtures.ts so the env check never fires.
// Same pattern as seed-quiz.test.ts / cleanup.test.ts / audit-helpers.test.ts.
// ---------------------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())
const mockSeedRedTeamUsers = vi.hoisted(() => vi.fn())
const mockPickSubjectWithQuestions = vi.hoisted(() => vi.fn())
const mockSeedVictimCompletedSession = vi.hoisted(() => vi.fn())
const mockCleanupFixtures = vi.hoisted(() => vi.fn())

vi.mock('../../helpers/supabase', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { signInWithPassword: vi.fn() },
  }),
}))

vi.mock('./seed-users', () => ({
  seedRedTeamUsers: mockSeedRedTeamUsers,
  VICTIM_EMAIL: 'victim@test.com',
  VICTIM_PASSWORD: 'password123!',
}))

vi.mock('./seed-quiz', () => ({
  pickSubjectWithQuestions: mockPickSubjectWithQuestions,
}))

vi.mock('./seed-victim-session', () => ({
  seedVictimCompletedSession: mockSeedVictimCompletedSession,
}))

// Partial mock: createFixtureTracker stays real so the tracker under assertion
// is the same object the helper populates.
vi.mock('./cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cleanup')>()),
  cleanupFixtures: mockCleanupFixtures,
}))

import type { getAdminClient } from '../../helpers/supabase'
import { seedUnauthFixtures } from './seed-unauth-fixtures'

// ---------------------------------------------------------------------------
// buildChain — project-wide pattern (see seed-quiz.test.ts / proxy.test.ts).
// Forwards every chained method call back to itself and resolves to
// `returnValue` when awaited — handles arbitrarily-long Supabase chains.
// ---------------------------------------------------------------------------
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

const SEED_RESULT = {
  victimUserId: 'victim-user-id',
  orgId: 'org-id',
  attackerUserId: 'attacker-user-id',
  otherOrgId: 'other-org-id',
}

const VICTIM_SESSION_ID = 'victim-session-id'

const PICKED_SUBJECT = {
  subjectId: 'subject-id',
  subjectCode: 'A',
  topicId: 'topic-id',
}

/** Set up happy-path mocks for calls BEFORE the admin query sequence. */
function setupCommonMocks() {
  mockSeedRedTeamUsers.mockResolvedValue(SEED_RESULT)
  mockPickSubjectWithQuestions.mockResolvedValue(PICKED_SUBJECT)
  mockSeedVictimCompletedSession.mockImplementation(
    async (_admin: unknown, _ids: unknown, tracker: { sessions: Set<string> }) => {
      tracker.sessions.add(VICTIM_SESSION_ID)
      return VICTIM_SESSION_ID
    },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seedUnauthFixtures', () => {
  describe('happy path', () => {
    it('returns the seeded identifiers and a cleanup tracker', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'known-session-id' }], error: null })) // quiz_sessions
        .mockReturnValueOnce(buildChain({ data: [{ id: 'known-question-id' }], error: null })) // questions
        .mockReturnValueOnce(buildChain({ data: { id: 'comment-id' }, error: null })) // question_comments insert
        .mockReturnValueOnce(
          buildChain({ data: [{ question_id: 'known-question-id' }], error: null }),
        ) // flagged_questions upsert

      const result = await seedUnauthFixtures(adminMock)

      expect(result.orgId).toBe('org-id')
      expect(result.victimUserId).toBe('victim-user-id')
      expect(result.knownSubjectId).toBe('subject-id')
      expect(result.knownTopicId).toBe('topic-id')
      expect(result.knownSessionId).toBe('known-session-id')
      expect(result.knownQuestionId).toBe('known-question-id')
      expect(result.knownVictimSessionId).toBe(VICTIM_SESSION_ID)
      expect(result.tracker).toBeDefined()
    })

    it('pre-populates the tracker with the seeded comment, flag, and session ids', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ id: 'q-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: { id: 'c-1' }, error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ question_id: 'q-1' }], error: null }))

      const { tracker } = await seedUnauthFixtures(adminMock)

      expect(tracker.comments.has('c-1')).toBe(true)
      expect(tracker.flags.has('victim-user-id::q-1')).toBe(true)
      expect(tracker.sessions.has(VICTIM_SESSION_ID)).toBe(true)
    })
  })

  describe('fallback / no-op silence', () => {
    it('falls back to the seeded victim session when no pre-existing session exists', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [], error: null })) // empty quiz_sessions
        .mockReturnValueOnce(buildChain({ data: [{ id: 'q-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: { id: 'c-1' }, error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ question_id: 'q-1' }], error: null }))

      const result = await seedUnauthFixtures(adminMock)

      // No invented id: on a clean DB this is the session seedVictimCompletedSession made.
      expect(result.knownSessionId).toBe(VICTIM_SESSION_ID)
    })

    it('refuses to seed when no active question exists rather than inventing an id', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: [], error: null })) // empty questions

      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(/no active question found/)
    })
  })

  describe('failure atomicity', () => {
    it('cleans the rows it already tracked when a later seeding step throws', async () => {
      setupCommonMocks()
      mockSeedVictimCompletedSession.mockRejectedValue(new Error('victim session boom'))

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ id: 'q-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: { id: 'c-1' }, error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ question_id: 'q-1' }], error: null }))

      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(/victim session boom/)

      // The caller never receives the tracker on a throw, so afterAll cannot
      // clean these — the helper has to do it before rethrowing.
      expect(mockCleanupFixtures).toHaveBeenCalledTimes(1)
      const tracked = mockCleanupFixtures.mock.calls[0]?.[1] as { comments: Set<string> }
      expect(tracked.comments.has('c-1')).toBe(true)
    })

    it('rethrows the seeding failure even when the cleanup itself fails', async () => {
      setupCommonMocks()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSeedVictimCompletedSession.mockRejectedValue(new Error('victim session boom'))
      mockCleanupFixtures.mockRejectedValue(new Error('cleanup boom'))

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ id: 'q-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: { id: 'c-1' }, error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ question_id: 'q-1' }], error: null }))

      // The seeding failure is the diagnostic; a cleanup failure must not mask it.
      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(/victim session boom/)
      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('error paths', () => {
    it('throws when the quiz_sessions lookup fails', async () => {
      setupCommonMocks()

      mockFrom.mockReturnValueOnce(
        buildChain({ data: null, error: { message: 'quiz_sessions db error' } }),
      )

      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(
        /quiz_sessions lookup failed.*quiz_sessions db error/,
      )
    })

    it('throws when the questions lookup fails', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null })) // quiz_sessions ok
        .mockReturnValueOnce(buildChain({ data: null, error: { message: 'questions db error' } }))

      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(
        /questions lookup failed.*questions db error/,
      )
    })

    it('throws when the question_comments insert fails', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ id: 'q-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: null, error: { message: 'comment insert error' } }))

      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(
        /failed to seed question_comment.*comment insert error/,
      )
    })

    it('throws when question_comments insert returns no data', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ id: 'q-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: null, error: null })) // null data, no error

      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(/failed to seed question_comment/)
    })

    it('throws when the flagged_questions upsert fails', async () => {
      setupCommonMocks()

      mockFrom
        .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: [{ id: 'q-1' }], error: null }))
        .mockReturnValueOnce(buildChain({ data: { id: 'c-1' }, error: null }))
        .mockReturnValueOnce(
          buildChain({ data: null, error: { message: 'flagged_questions upsert error' } }),
        )

      await expect(seedUnauthFixtures(adminMock)).rejects.toThrow(
        /failed to seed flagged_question.*flagged_questions upsert error/,
      )
    })
  })
})
