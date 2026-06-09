import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Supabase admin-client mock — same pattern as seed.test.ts / audit-helpers.test.ts.
// Must be set up BEFORE importing cleanup.ts.
// ---------------------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../helpers/supabase', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

import { cleanupFixtures, createFixtureTracker } from './cleanup'

// ---------------------------------------------------------------------------
// buildChain — project-wide pattern (see seed.test.ts)
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

const adminMock = { from: mockFrom } as unknown as Parameters<typeof cleanupFixtures>[0]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createFixtureTracker', () => {
  it('returns an object with empty Sets for all tracked tables', () => {
    const tracker = createFixtureTracker()
    expect(tracker.sessions.size).toBe(0)
    expect(tracker.codes.size).toBe(0)
    expect(tracker.comments.size).toBe(0)
    expect(tracker.flags.size).toBe(0)
    expect(tracker.consents.size).toBe(0)
    expect(tracker.users.size).toBe(0)
  })
})

describe('cleanupFixtures — soft-delete paths', () => {
  it('soft-deletes quiz_sessions when the set is populated', async () => {
    const tracker = createFixtureTracker()
    tracker.sessions.add('sess-1')
    tracker.sessions.add('sess-2')

    mockFrom.mockReturnValueOnce(
      buildChain({ data: [{ id: 'sess-1' }, { id: 'sess-2' }], error: null }),
    )

    await cleanupFixtures(adminMock, tracker)

    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
    // tracker should be cleared after cleanup
    expect(tracker.sessions.size).toBe(0)
  })

  it('soft-deletes internal_exam_codes when the set is populated', async () => {
    const tracker = createFixtureTracker()
    tracker.codes.add('code-1')

    mockFrom.mockReturnValueOnce(buildChain({ data: [{ id: 'code-1' }], error: null }))

    await cleanupFixtures(adminMock, tracker)

    expect(mockFrom).toHaveBeenCalledWith('internal_exam_codes')
    expect(tracker.codes.size).toBe(0)
  })

  it('soft-deletes flagged_questions scoped by the seeding student when the set is populated', async () => {
    const tracker = createFixtureTracker()
    tracker.flags.add('student-1::question-1')

    mockFrom.mockReturnValueOnce(buildChain({ data: [{ question_id: 'question-1' }], error: null }))

    await cleanupFixtures(adminMock, tracker)

    expect(mockFrom).toHaveBeenCalledWith('flagged_questions')
    expect(tracker.flags.size).toBe(0)
  })

  it('soft-deletes question_comments when the set is populated', async () => {
    const tracker = createFixtureTracker()
    tracker.comments.add('comment-1')

    mockFrom.mockReturnValueOnce(buildChain({ data: [{ id: 'comment-1' }], error: null }))

    await cleanupFixtures(adminMock, tracker)

    expect(mockFrom).toHaveBeenCalledWith('question_comments')
    expect(tracker.comments.size).toBe(0)
  })
})

describe('cleanupFixtures — hard-delete path (user_consents)', () => {
  it('hard-deletes user_consents when the set is populated', async () => {
    const tracker = createFixtureTracker()
    tracker.consents.add('consent-1')

    mockFrom.mockReturnValueOnce(buildChain({ data: [{ id: 'consent-1' }], error: null }))

    await cleanupFixtures(adminMock, tracker)

    expect(mockFrom).toHaveBeenCalledWith('user_consents')
    expect(tracker.consents.size).toBe(0)
  })
})

describe('cleanupFixtures — users restore path', () => {
  it('restores soft-deleted users when the set is populated', async () => {
    const tracker = createFixtureTracker()
    tracker.users.add('user-1')

    mockFrom.mockReturnValueOnce(buildChain({ data: [{ id: 'user-1' }], error: null }))

    await cleanupFixtures(adminMock, tracker)

    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(tracker.users.size).toBe(0)
  })
})

describe('cleanupFixtures — no-op silence', () => {
  it('does not call from() for tables with empty sets', async () => {
    const tracker = createFixtureTracker()
    // All sets are empty — mockFrom should never be called
    await cleanupFixtures(adminMock, tracker)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('clears the set in finally even when the mutation returns zero affected rows', async () => {
    const tracker = createFixtureTracker()
    tracker.sessions.add('sess-no-op')

    // Return empty data array (zero rows affected) — should NOT log but still clear
    mockFrom.mockReturnValueOnce(buildChain({ data: [], error: null }))

    await cleanupFixtures(adminMock, tracker)

    expect(tracker.sessions.size).toBe(0)
  })
})

describe('cleanupFixtures — error path', () => {
  it('accumulates errors from all failed blocks and throws an aggregated error', async () => {
    const tracker = createFixtureTracker()
    tracker.sessions.add('sess-err')
    tracker.codes.add('code-err')

    // Both mutation calls return errors
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'sessions error' } }))
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'codes error' } }))

    await expect(cleanupFixtures(adminMock, tracker)).rejects.toThrow(/sessions error/)

    // Both sets cleared even though errors were thrown
    expect(tracker.sessions.size).toBe(0)
    expect(tracker.codes.size).toBe(0)
  })

  it('clears the set in finally even when the delete throws', async () => {
    const tracker = createFixtureTracker()
    tracker.consents.add('consent-err')

    mockFrom.mockReturnValueOnce(buildChain({ data: null, error: { message: 'db down' } }))

    await expect(cleanupFixtures(adminMock, tracker)).rejects.toThrow(/db down/)
    expect(tracker.consents.size).toBe(0)
  })
})
