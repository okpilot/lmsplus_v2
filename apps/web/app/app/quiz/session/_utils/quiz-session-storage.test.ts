import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveSession } from './quiz-session-storage'
import {
  ACTIVE_SESSION_KEY_PREFIX,
  clearActiveSession,
  clearActiveSessionIfCurrent,
  readActiveSession,
} from './quiz-session-storage'

const USER_ID = 'test-user-id'
const STORAGE_KEY = `quiz-active-session:${USER_ID}`

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
  ...overrides,
})

// ---- readActiveSession --------------------------------------------------------

// Seeds the entry a previous tab left behind (the write path is retired).
function writeActiveSession(data: ActiveSession) {
  localStorage.setItem(`quiz-active-session:${data.userId}`, JSON.stringify(data))
}

describe('readActiveSession', () => {
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

  it('returns the stored session', () => {
    writeActiveSession(makeSession())
    expect(readActiveSession(USER_ID)).toEqual(makeSession())
  })

  it('returns null when key is missing', () => {
    expect(readActiveSession(USER_ID)).toBeNull()
  })

  it('returns null and removes key when JSON is malformed', () => {
    mockStorage._store.set(STORAGE_KEY, '{{not valid json}}')

    expect(readActiveSession(USER_ID)).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('returns null and removes key when userId does not match', () => {
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(makeSession({ userId: 'other-user-id' })))

    expect(readActiveSession(USER_ID)).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it.each([
    { label: 'missing', entry: { userId: USER_ID } },
    { label: 'empty', entry: { userId: USER_ID, sessionId: '' } },
    { label: 'not a string', entry: { userId: USER_ID, sessionId: 123 } },
  ])('returns null and removes key when sessionId is $label', ({ entry }) => {
    mockStorage._store.set(STORAGE_KEY, JSON.stringify(entry))

    expect(readActiveSession(USER_ID)).toBeNull()
    expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it.each([
    { label: 'null', raw: 'null' },
    { label: 'a string', raw: '"text"' },
    { label: 'a number', raw: '42' },
  ])('returns null and removes key when the entry is $label', ({ raw }) => {
    mockStorage._store.set(STORAGE_KEY, raw)

    expect(readActiveSession(USER_ID)).toBeNull()
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

  it('keys the entry by the exported prefix plus the user id', () => {
    expect(STORAGE_KEY).toBe(`${ACTIVE_SESSION_KEY_PREFIX}${USER_ID}`)
  })
})

// ---- clearActiveSessionIfCurrent ---------------------------------------------

describe('clearActiveSessionIfCurrent', () => {
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

  it('removes the entry when it is the session the caller named', () => {
    writeActiveSession(makeSession())

    expect(clearActiveSessionIfCurrent(USER_ID, makeSession().sessionId)).toBe(true)
    expect(mockStorage._store.has(STORAGE_KEY)).toBe(false)
  })

  // The reason this helper exists: every caller acts on a session it read earlier, so storage
  // may already hold a NEWER one whose answer buffer a blind clear would destroy.
  it('keeps a newer session and reports that it did not clear', () => {
    writeActiveSession(makeSession({ sessionId: 'sess-newer' }))

    expect(clearActiveSessionIfCurrent(USER_ID, 'sess-older')).toBe(false)
    expect(mockStorage._store.has(STORAGE_KEY)).toBe(true)
    expect(mockStorage.removeItem).not.toHaveBeenCalled()
  })

  it('reports no clear when there is no entry at all', () => {
    expect(clearActiveSessionIfCurrent(USER_ID, 'sess-anything')).toBe(false)
    expect(mockStorage.removeItem).not.toHaveBeenCalled()
  })
})
