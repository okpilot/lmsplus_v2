import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveSession } from './quiz-session-storage'
import {
  buildActiveSession,
  clearActiveSession,
  readActiveSession,
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
})
