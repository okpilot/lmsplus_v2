import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveSession } from './quiz-session-storage'
import {
  buildActiveSession,
  buildHandoffPayload,
  clearActiveSession,
  clearSessionHandoff,
  readActiveSession,
  readSessionHandoff,
  sessionHandoffKey,
  toSessionData,
  writeActiveSession,
} from './quiz-session-storage'

const USER_ID = 'test-user-id'
const STORAGE_KEY = `quiz-active-session:${USER_ID}`
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// ---- localStorage mock -------------------------------------------------------
// jsdom's localStorage may not extend Storage.prototype (--localstorage-file mode),
// so we replace globalThis.localStorage with a simple in-memory mock.

function makeLocalStorageMock() {
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

// ---- Fixtures ----------------------------------------------------------------

const makeSession = (overrides?: Partial<ActiveSession>): ActiveSession => ({
  userId: USER_ID,
  sessionId: 'sess-123',
  questionIds: ['q1', 'q2', 'q3'],
  answers: { q1: { selectedOptionId: 'opt-a', responseTimeMs: 1200 } },
  currentIndex: 1,
  subjectName: 'Meteorology',
  subjectCode: 'MET',
  draftId: 'draft-abc',
  savedAt: Date.now(),
  ...overrides,
})

// ---- writeActiveSession + readActiveSession -----------------------------------

describe('writeActiveSession + readActiveSession', () => {
  let mockStorage: ReturnType<typeof makeLocalStorageMock>

  beforeEach(() => {
    vi.resetAllMocks()
    mockStorage = makeLocalStorageMock()
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })
  })

  it('round-trips a session correctly', () => {
    const session = makeSession()
    writeActiveSession(session)
    const result = readActiveSession(USER_ID)
    expect(result).toEqual(session)
  })

  it('returns null when key is missing', () => {
    const result = readActiveSession(USER_ID)
    expect(result).toBeNull()
  })

  it('returns null and removes key when JSON is malformed', () => {
    mockStorage._store.set(STORAGE_KEY, '{{not valid json}}')

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null and removes key when data is stale (>7 days)', () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const staleSession = makeSession({ savedAt: now - SEVEN_DAYS_MS - 1 })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(staleSession))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns data when session is fresh (<7 days)', () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const freshSession = makeSession({ savedAt: now - SEVEN_DAYS_MS + 1000 })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(freshSession))

    const result = readActiveSession(USER_ID)

    expect(result).toEqual(freshSession)
  })

  it('returns null and removes key when required field sessionId is missing', () => {
    const broken = {
      userId: USER_ID,
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null and removes key when questionIds is not an array', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: 'not-an-array',
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null and removes key when userId does not match', () => {
    const otherUserSession = makeSession({ userId: 'other-user-id' })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(otherUserSession))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when questionIds contains non-string items', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1', 42, 'q3'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when questionIds contains empty strings', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1', '', 'q3'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when an answer value has wrong shape', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: { q1: { selectedOptionId: 123, responseTimeMs: 'not-a-number' } },
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when an answer value is missing selectedOptionId', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: { q1: { responseTimeMs: 500 } },
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when questionIds is an empty array', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: [],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when currentIndex is negative', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: -1,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when currentIndex exceeds questionIds length', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: 5,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null when currentIndex is a float', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1', 'q2'],
      savedAt: Date.now(),
      currentIndex: 1.5,
      answers: {},
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('accepts valid feedback entries and returns the session', () => {
    const session = makeSession({
      feedback: {
        q1: {
          isCorrect: true,
          correctOptionId: 'opt-a',
          explanationText: 'Because lift.',
          explanationImageUrl: null,
        },
      },
    })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(session))

    const result = readActiveSession(USER_ID)

    expect(result).not.toBeNull()
    expect(result?.feedback?.q1?.isCorrect).toBe(true)
  })

  it('returns null and removes key when a feedback entry is missing isCorrect', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
      feedback: {
        q1: {
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
          // isCorrect omitted
        },
      },
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null and removes key when a feedback entry has wrong type for isCorrect', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
      feedback: {
        q1: {
          isCorrect: 'yes', // should be boolean
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null and removes key when a feedback entry has explanationText as a number', () => {
    const broken = {
      userId: USER_ID,
      sessionId: 'sess-1',
      questionIds: ['q1'],
      savedAt: Date.now(),
      currentIndex: 0,
      answers: {},
      feedback: {
        q1: {
          isCorrect: false,
          correctOptionId: 'opt-b',
          explanationText: 42, // should be string or null
          explanationImageUrl: null,
        },
      },
    }
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('accepts sessions with an empty feedback object', () => {
    const session = makeSession({ feedback: {} })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(session))

    const result = readActiveSession(USER_ID)

    expect(result).not.toBeNull()
  })

  it('round-trips a session with mode: exam', () => {
    const session = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 1800,
      passMark: 75,
    })
    writeActiveSession(session)

    const result = readActiveSession(USER_ID)

    expect(result).not.toBeNull()
    expect(result?.mode).toBe('exam')
    expect(result?.startedAt).toBe('2026-04-27T12:00:00.000Z')
    expect(result?.timeLimitSeconds).toBe(1800)
    expect(result?.passMark).toBe(75)
  })

  it('rejects mode: exam entries that lack startedAt', () => {
    const broken = makeSession({ mode: 'exam', timeLimitSeconds: 1800 })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('rejects mode: exam entries that lack timeLimitSeconds', () => {
    const broken = makeSession({ mode: 'exam', startedAt: '2026-04-27T12:00:00.000Z' })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('accepts mode: exam entries with both startedAt and timeLimitSeconds present', () => {
    const valid = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 1800,
    })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(valid))

    const result = readActiveSession(USER_ID)

    expect(result).not.toBeNull()
    expect(result?.mode).toBe('exam')
  })

  it('rejects mode: exam entries where startedAt is an unparseable string', () => {
    const broken = makeSession({
      mode: 'exam',
      startedAt: 'not-a-date',
      timeLimitSeconds: 1800,
    })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('rejects exam sessions where startedAt is a number instead of an ISO string', () => {
    // Epoch-ms corruption: a writer stored Date.now() instead of new Date().toISOString().
    const broken = makeSession({
      mode: 'exam',
      startedAt: 1714219200000 as unknown as string,
      timeLimitSeconds: 1800,
    })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('rejects exam sessions with a zero-second time limit', () => {
    const broken = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 0,
    })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('rejects exam sessions with a null time limit value', () => {
    const broken = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 60,
    }) as unknown as Record<string, unknown>
    broken.timeLimitSeconds = null
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('rejects exam sessions with a negative time limit', () => {
    const broken = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: -1,
    })
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(broken))

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('rejects exam sessions when timeLimitSeconds overflows to Infinity', () => {
    // 1e309 parses to Infinity; JSON.stringify({x: Infinity}) drops to null,
    // so we serialise via makeSession with a sentinel and substitute the raw literal.
    const base = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: '__OVERFLOW__' as unknown as number,
    })
    const brokenJson = JSON.stringify(base).replace('"__OVERFLOW__"', '1e309')
    mockStorage._store.set(STORAGE_KEY, brokenJson)

    const result = readActiveSession(USER_ID)

    expect(result).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('round-trips a session without mode field (backward compat)', () => {
    const legacySession = makeSession()
    const raw = { ...legacySession } as Record<string, unknown>
    delete raw.mode
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(raw))

    const result = readActiveSession(USER_ID)

    expect(result).not.toBeNull()
    expect(result?.mode).toBeUndefined()
  })
})

// ---- clearActiveSession ------------------------------------------------------

describe('clearActiveSession', () => {
  let mockStorage: ReturnType<typeof makeLocalStorageMock>

  beforeEach(() => {
    vi.resetAllMocks()
    mockStorage = makeLocalStorageMock()
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })
  })

  it('removes the key from localStorage', () => {
    const session = makeSession()
    writeActiveSession(session)

    clearActiveSession(USER_ID)

    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
    expect(mockStorage._store.has(STORAGE_KEY)).toBe(false)
  })

  it('is safe when the key does not exist', () => {
    expect(() => clearActiveSession(USER_ID)).not.toThrow()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })
})

// ---- writeActiveSession (error path) -----------------------------------------

describe('writeActiveSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('swallows storage errors without throwing', () => {
    const throwingStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new TypeError('storage unavailable')
      }),
      removeItem: vi.fn(),
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingStorage,
      writable: true,
      configurable: true,
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const session = makeSession()
    expect(() => writeActiveSession(session)).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(
      '[quiz-session-storage] Write failed:',
      expect.any(TypeError),
    )
  })
})

// ---- buildActiveSession ------------------------------------------------------

describe('buildActiveSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('assembles a session correctly from opts, answers Map, and index', () => {
    const fixedNow = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

    const opts = {
      userId: USER_ID,
      sessionId: 'sess-xyz',
      questions: [{ id: 'q1' }, { id: 'q2' }],
      subjectName: 'Navigation',
      subjectCode: 'NAV',
      draftId: 'draft-99',
    }
    const answers = new Map([['q1', { selectedOptionId: 'opt-b', responseTimeMs: 800 }]])

    const result = buildActiveSession(opts, answers, 1)

    expect(result).toEqual({
      userId: USER_ID,
      sessionId: 'sess-xyz',
      questionIds: ['q1', 'q2'],
      answers: { q1: { selectedOptionId: 'opt-b', responseTimeMs: 800 } },
      currentIndex: 1,
      subjectName: 'Navigation',
      subjectCode: 'NAV',
      draftId: 'draft-99',
      savedAt: fixedNow,
    })
  })

  it('omits optional fields when not provided', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)

    const opts = {
      userId: USER_ID,
      sessionId: 'sess-min',
      questions: [{ id: 'q1' }],
    }
    const result = buildActiveSession(opts, new Map(), 0)

    expect(result.subjectName).toBeUndefined()
    expect(result.subjectCode).toBeUndefined()
    expect(result.draftId).toBeUndefined()
  })

  it('serialises the feedback Map into a plain Record on the returned session', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)

    const opts = {
      userId: USER_ID,
      sessionId: 'sess-fb',
      questions: [{ id: 'q1' }, { id: 'q2' }],
    }
    const feedbackMap = new Map([
      [
        'q1',
        {
          isCorrect: true,
          correctOptionId: 'opt-a',
          explanationText: 'Because lift.',
          explanationImageUrl: null,
        },
      ],
      [
        'q2',
        {
          isCorrect: false,
          correctOptionId: 'opt-b',
          explanationText: null,
          explanationImageUrl: null,
        },
      ],
    ])

    const result = buildActiveSession(opts, new Map(), 0, feedbackMap)

    expect(result.feedback).toEqual({
      q1: {
        isCorrect: true,
        correctOptionId: 'opt-a',
        explanationText: 'Because lift.',
        explanationImageUrl: null,
      },
      q2: {
        isCorrect: false,
        correctOptionId: 'opt-b',
        explanationText: null,
        explanationImageUrl: null,
      },
    })
  })

  it('omits the feedback field entirely when no feedback Map is provided', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)

    const opts = {
      userId: USER_ID,
      sessionId: 'sess-no-fb',
      questions: [{ id: 'q1' }],
    }

    const result = buildActiveSession(opts, new Map(), 0)

    expect(result.feedback).toBeUndefined()
  })

  it('returns an exam-mode session when exam mode is requested', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)

    const opts = {
      userId: USER_ID,
      sessionId: 'sess-exam',
      questions: [{ id: 'q1' }],
      mode: 'exam' as const,
    }

    const result = buildActiveSession(opts, new Map(), 0)

    expect(result.mode).toBe('exam')
  })

  it('includes provided exam timing metadata in the session', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)

    const opts = {
      userId: USER_ID,
      sessionId: 'sess-exam',
      questions: [{ id: 'q1' }],
      mode: 'exam' as const,
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 1800,
      passMark: 75,
    }

    const result = buildActiveSession(opts, new Map(), 0)

    expect(result.startedAt).toBe('2026-04-27T12:00:00.000Z')
    expect(result.timeLimitSeconds).toBe(1800)
    expect(result.passMark).toBe(75)
  })
})

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
  })

  it('rejects payload when draftCurrentIndex is a string', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftCurrentIndex: 'not-a-number' }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
  })

  it('rejects payload when draftId is an empty string', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftId: '' }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
  })

  it('rejects payload when subjectName is a number', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], subjectName: 42 }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
  })

  it('rejects payload when subjectCode is a boolean', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], subjectCode: true }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
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
  })

  it('rejects payload when draftFeedback is an array', () => {
    const key = sessionHandoffKey(USER_ID)
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftFeedback: ['bad'] }
    mockSession._store.set(key, JSON.stringify(data))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(readSessionHandoff(USER_ID)).toBeNull()
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

// ---- toSessionData -----------------------------------------------------------

describe('toSessionData', () => {
  it('includes startedAt, timeLimitSeconds, passMark when present on the ActiveSession', () => {
    const active = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 1800,
      passMark: 75,
    })

    const result = toSessionData(active)

    expect(result.startedAt).toBe('2026-04-27T12:00:00.000Z')
    expect(result.timeLimitSeconds).toBe(1800)
    expect(result.passMark).toBe(75)
    expect(result.mode).toBe('exam')
  })

  it('leaves new fields undefined when ActiveSession does not carry them', () => {
    const active = makeSession()

    const result = toSessionData(active)

    expect(result.startedAt).toBeUndefined()
    expect(result.timeLimitSeconds).toBeUndefined()
    expect(result.passMark).toBeUndefined()
  })
})

// ---- buildHandoffPayload -----------------------------------------------------

describe('buildHandoffPayload', () => {
  it('includes startedAt, timeLimitSeconds, passMark in the payload when present', () => {
    const active = makeSession({
      mode: 'exam',
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 1800,
      passMark: 75,
    })

    const payload = buildHandoffPayload(USER_ID, active)

    expect(payload.startedAt).toBe('2026-04-27T12:00:00.000Z')
    expect(payload.timeLimitSeconds).toBe(1800)
    expect(payload.passMark).toBe(75)
  })

  it('omits the new fields when not on the source ActiveSession', () => {
    const active = makeSession()

    const payload = buildHandoffPayload(USER_ID, active)

    expect(payload.startedAt).toBeUndefined()
    expect(payload.timeLimitSeconds).toBeUndefined()
    expect(payload.passMark).toBeUndefined()
  })

  it('preserves session mode on the handoff payload', () => {
    const examPayload = buildHandoffPayload(USER_ID, makeSession({ mode: 'exam' }))
    const studyPayload = buildHandoffPayload(USER_ID, makeSession({ mode: 'study' }))

    expect(examPayload.mode).toBe('exam')
    expect(studyPayload.mode).toBe('study')
  })
})
