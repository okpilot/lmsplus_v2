import { describe, expect, it } from 'vitest'
import { isValidActiveSession } from './quiz-session-active-validation'
import type { ActiveSession } from './quiz-session-storage'

// Extracted from quiz-session-storage.ts (§1 file cap). The storage suite still covers these
// rules transitively through readActiveSession's purge behaviour; this file pins the predicate
// directly, so a regression names the rule that broke instead of surfacing as "read returned
// null" three layers up.

const USER_ID = 'user-001'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const makeSession = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  userId: USER_ID,
  sessionId: 'sess-001',
  questionIds: ['q1', 'q2'],
  answers: { q1: { selectedOptionId: 'opt-a', responseTimeMs: 1000 } },
  currentIndex: 1,
  savedAt: Date.now(),
  ...overrides,
})

describe('isValidActiveSession', () => {
  it('accepts a well-formed entry for the current user', () => {
    expect(isValidActiveSession(makeSession(), USER_ID)).toBe(true)
  })

  it('rejects an entry belonging to a different user', () => {
    expect(isValidActiveSession(makeSession({ userId: 'someone-else' }), USER_ID)).toBe(false)
  })

  it('rejects an entry saved more than seven days ago', () => {
    const stale = makeSession({ savedAt: Date.now() - SEVEN_DAYS_MS - 1 })
    expect(isValidActiveSession(stale, USER_ID)).toBe(false)
  })

  // Discovery is browse-only and never persisted, so a stored one is stale or tampered. This
  // deliberately DIVERGES from the handoff validator, which does admit discovery (one-shot).
  it('rejects a persisted discovery session while accepting study and legacy entries', () => {
    expect(isValidActiveSession(makeSession({ mode: 'discovery' } as never), USER_ID)).toBe(false)
    expect(isValidActiveSession(makeSession({ mode: 'study' }), USER_ID)).toBe(true)
    expect(isValidActiveSession(makeSession({ mode: undefined }), USER_ID)).toBe(true)
  })

  // The exam runner needs both to rebuild its countdown; without them it would mount a timer
  // with no deadline.
  it('rejects an exam entry missing the fields its timer needs', () => {
    const base = { mode: 'exam' as const, startedAt: '2026-04-27T10:00:00.000Z' }
    expect(isValidActiveSession(makeSession(base), USER_ID)).toBe(false)
    expect(isValidActiveSession(makeSession({ ...base, timeLimitSeconds: 3600 }), USER_ID)).toBe(
      true,
    )
    expect(isValidActiveSession(makeSession({ ...base, timeLimitSeconds: 0 }), USER_ID)).toBe(false)
    expect(
      isValidActiveSession(
        makeSession({ mode: 'exam', startedAt: 'not-a-date', timeLimitSeconds: 3600 }),
        USER_ID,
      ),
    ).toBe(false)
  })

  it('rejects an index that points past the end of the question list', () => {
    expect(isValidActiveSession(makeSession({ currentIndex: 2 }), USER_ID)).toBe(false)
    expect(isValidActiveSession(makeSession({ currentIndex: -1 }), USER_ID)).toBe(false)
  })

  it('rejects an entry with no questions', () => {
    expect(isValidActiveSession(makeSession({ questionIds: [] }), USER_ID)).toBe(false)
  })
})
