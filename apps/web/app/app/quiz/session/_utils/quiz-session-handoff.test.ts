import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionHandoff, readSessionHandoff, sessionHandoffKey } from './quiz-session-handoff'

const USER_ID = 'test-user-id'

// ---- sessionHandoffKey -------------------------------------------------------

describe('sessionHandoffKey', () => {
  it('produces a user-scoped key', () => {
    expect(sessionHandoffKey('user-1')).toBe('quiz-session:user-1')
  })

  it('produces different keys for different users', () => {
    expect(sessionHandoffKey('user-a')).not.toBe(sessionHandoffKey('user-b'))
  })
})

// ---- readSessionHandoff ------------------------------------------------------

function makeSessionStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v)
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k)
    }),
    _store: store,
    _reset: () => store.clear(),
  }
}

describe('readSessionHandoff', () => {
  let mockSession: ReturnType<typeof makeSessionStorageMock>

  beforeEach(() => {
    vi.resetAllMocks()
    mockSession = makeSessionStorageMock()
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mockSession,
      writable: true,
      configurable: true,
    })
  })

  it('returns null when the key is absent', () => {
    expect(readSessionHandoff(USER_ID)).toBeNull()
  })

  it('returns valid session data for a minimal payload', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'] }
    mockSession._store.set(sessionHandoffKey(USER_ID), JSON.stringify(data))

    const result = readSessionHandoff(USER_ID)

    expect(result).toEqual(data)
  })

  it('returns valid session data including optional fields', () => {
    const data = {
      sessionId: 'sess-2',
      questionIds: ['q1', 'q2'],
      draftAnswers: { q1: { selectedOptionId: 'opt-a', responseTimeMs: 500 } },
      draftCurrentIndex: 1,
      draftId: 'draft-7',
      subjectName: 'Meteorology',
      subjectCode: 'MET',
    }
    mockSession._store.set(sessionHandoffKey(USER_ID), JSON.stringify(data))

    const result = readSessionHandoff(USER_ID)

    expect(result).toEqual(data)
  })

  it('returns null and removes the key when JSON is malformed', () => {
    const key = sessionHandoffKey(USER_ID)
    mockSession._store.set(key, '{{not valid json}}')

    const result = readSessionHandoff(USER_ID)

    expect(result).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('returns null and removes the key when the payload fails validation (missing sessionId)', () => {
    const key = sessionHandoffKey(USER_ID)
    mockSession._store.set(key, JSON.stringify({ questionIds: ['q1'] }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = readSessionHandoff(USER_ID)

    expect(result).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns null and removes the key when userId is present but does not match', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], userId: 'other-user' }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = readSessionHandoff(USER_ID)

    expect(result).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('returns null and removes the key when questionIds is empty', () => {
    const key = sessionHandoffKey(USER_ID)
    mockSession._store.set(key, JSON.stringify({ sessionId: 'sess-1', questionIds: [] }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = readSessionHandoff(USER_ID)

    expect(result).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('returns null when sessionStorage.getItem throws SecurityError', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: vi.fn(() => {
          throw new DOMException('The operation is insecure', 'SecurityError')
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })

    expect(readSessionHandoff(USER_ID)).toBeNull()
  })

  it('rejects payload when draftAnswers is an array instead of a record', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftAnswers: ['bad'] }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('rejects payload when draftCurrentIndex is a string', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftCurrentIndex: 'not-a-number' }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('rejects payload when draftId is an empty string', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftId: '' }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('rejects payload when subjectName is a number', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], subjectName: 42 }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('rejects payload when subjectCode is a boolean', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], subjectCode: true }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('accepts payload with valid draftFeedback entries', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = {
      sessionId: 'sess-1',
      questionIds: ['q1'],
      draftFeedback: {
        q1: {
          isCorrect: true,
          correctOptionId: 'opt-a',
          explanationText: 'Correct!',
          explanationImageUrl: null,
        },
      },
    }
    mockSession._store.set(key, JSON.stringify(data))

    expect(readSessionHandoff(USER_ID)).toEqual(data)
  })

  it('rejects payload when draftFeedback entry is missing isCorrect', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = {
      sessionId: 'sess-1',
      questionIds: ['q1'],
      draftFeedback: {
        q1: {
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('rejects payload when draftFeedback is an array', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftFeedback: ['bad'] }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('rejects payload when a draftFeedback entry has isCorrect as a string', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = {
      sessionId: 'sess-1',
      questionIds: ['q1'],
      draftFeedback: {
        q1: {
          isCorrect: 'true', // should be boolean
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('does not read a different user key', () => {
    mockSession._store.set(
      sessionHandoffKey('other-user'),
      JSON.stringify({ sessionId: 's', questionIds: ['q1'] }),
    )

    const result = readSessionHandoff(USER_ID)

    expect(result).toBeNull()
  })

  it('accepts a handoff with mode: exam and non-empty questionIds', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-exam-1', questionIds: ['q1', 'q2'], mode: 'exam' }
    mockSession._store.set(key, JSON.stringify(data))

    const result = readSessionHandoff(USER_ID)

    expect(result).not.toBeNull()
    expect(result?.mode).toBe('exam')
  })

  it('rejects a handoff with mode: exam and empty questionIds (defensive validation)', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { userId: USER_ID, sessionId: 'sess-exam-1', mode: 'exam', questionIds: [] }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = readSessionHandoff(USER_ID)

    expect(result).toBeNull()
    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
  })

  it('returns null without throwing when malformed JSON cleanup removeItem throws SecurityError', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: vi.fn(() => '{{not valid json}}'),
        setItem: vi.fn(),
        removeItem: vi.fn(() => {
          throw new DOMException('The operation is insecure', 'SecurityError')
        }),
      },
      writable: true,
      configurable: true,
    })

    expect(readSessionHandoff(USER_ID)).toBeNull()
  })
})

// ---- clearSessionHandoff -----------------------------------------------------

describe('clearSessionHandoff', () => {
  let mockSession: ReturnType<typeof makeSessionStorageMock>

  beforeEach(() => {
    vi.resetAllMocks()
    mockSession = makeSessionStorageMock()
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: mockSession,
      writable: true,
      configurable: true,
    })
  })

  it('removes the user-scoped handoff key', () => {
    const key = sessionHandoffKey(USER_ID)
    mockSession._store.set(key, JSON.stringify({ sessionId: 's', questionIds: ['q1'] }))

    clearSessionHandoff(USER_ID)

    expect(mockSession.removeItem).toHaveBeenCalledWith(key)
    expect(mockSession._store.has(key)).toBe(false)
  })

  it('is safe when the key does not exist', () => {
    expect(() => clearSessionHandoff(USER_ID)).not.toThrow()
    expect(mockSession.removeItem).toHaveBeenCalledWith(sessionHandoffKey(USER_ID))
  })

  it('does not throw when sessionStorage.removeItem throws SecurityError', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(() => {
          throw new DOMException('The operation is insecure', 'SecurityError')
        }),
      },
      writable: true,
      configurable: true,
    })

    expect(() => clearSessionHandoff(USER_ID)).not.toThrow()
  })
})
