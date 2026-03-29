/**
 * Tests for the pure exports from use-session-bootstrap.
 *
 * NOTE: useSessionBootstrap itself is NOT tested here — it hangs vitest due to
 * sessionStorage + async effects + useRouter interactions (tracked in #422).
 * Only the exported pure helpers are covered.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { isValidSessionData } from '../_utils/quiz-session-storage'
import { _resetCachedSession } from './use-session-bootstrap'

beforeEach(() => {
  _resetCachedSession()
})

// ---- isValidSessionData ------------------------------------------------------

describe('isValidSessionData', () => {
  const VALID_USER = 'user-abc'

  it('returns true for a minimal valid payload', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(true)
  })

  it('returns true for a full payload without userId field', () => {
    const data = {
      sessionId: 'sess-1',
      questionIds: ['q1', 'q2'],
      draftAnswers: {},
      draftCurrentIndex: 0,
      draftId: 'draft-1',
      subjectName: 'Met',
      subjectCode: 'MET',
    }
    expect(isValidSessionData(data, VALID_USER)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isValidSessionData(null, VALID_USER)).toBe(false)
  })

  it('returns false for a primitive string', () => {
    expect(isValidSessionData('not-an-object', VALID_USER)).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isValidSessionData(42, VALID_USER)).toBe(false)
  })

  it('returns false when sessionId is missing', () => {
    const data = { questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when sessionId is an empty string', () => {
    const data = { sessionId: '', questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when sessionId is a number', () => {
    const data = { sessionId: 123, questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when questionIds is missing', () => {
    const data = { sessionId: 'sess-1' }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when questionIds is not an array', () => {
    const data = { sessionId: 'sess-1', questionIds: 'q1' }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when questionIds is an empty array', () => {
    const data = { sessionId: 'sess-1', questionIds: [] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when userId is present but does not match expectedUserId', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], userId: 'other-user' }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns true when userId is present and matches expectedUserId', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], userId: VALID_USER }
    expect(isValidSessionData(data, VALID_USER)).toBe(true)
  })

  it('returns true when userId field is absent (no cross-user check applied)', () => {
    // The guard only fires when userId is IN the payload — omitting it is allowed.
    const data = { sessionId: 'sess-1', questionIds: ['q1'] }
    expect(isValidSessionData(data, 'any-user-id')).toBe(true)
  })

  it('narrows type — result is SessionData when true', () => {
    const data: unknown = { sessionId: 'sess-1', questionIds: ['q1'] }
    if (isValidSessionData(data, VALID_USER)) {
      // TypeScript type narrowing: accessing .sessionId should compile
      expect(data.sessionId).toBe('sess-1')
    }
  })
})
