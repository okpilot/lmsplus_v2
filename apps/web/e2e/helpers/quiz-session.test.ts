import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
  TEST_EMAIL: 'e2e-test@lmsplus.local',
}))

import {
  clearQuizActiveSessionKeys,
  isServerActionPost,
  readServerAnsweredCount,
  submitFirstOption,
} from './quiz-session'

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: required to make Supabase mock awaitable
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

type Result = { data: unknown; error: { message: string } | null }

function mockTables(tables: Record<string, Result>) {
  mockGetAdminClient.mockReturnValue({
    from: (table: string) => buildChain(tables[table] ?? { data: null, error: null }),
  })
}

const OK_STUDENT: Result = { data: { id: 'student-1' }, error: null }
const OK_SESSION: Result = { data: { id: 'session-1' }, error: null }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('isServerActionPost', () => {
  const req = (method: string, headers: Record<string, string>) => ({
    method: () => method,
    headers: () => headers,
  })

  it('accepts a POST carrying the next-action header', () => {
    expect(isServerActionPost(req('POST', { 'next-action': 'abc' }))).toBe(true)
  })

  it('rejects a POST without the next-action header', () => {
    expect(isServerActionPost(req('POST', { 'content-type': 'text/plain' }))).toBe(false)
  })

  it('rejects a GET even when it carries the next-action header', () => {
    expect(isServerActionPost(req('GET', { 'next-action': 'abc' }))).toBe(false)
  })
})

describe('readServerAnsweredCount', () => {
  it('throws when the student lookup fails', async () => {
    mockTables({ users: { data: null, error: { message: 'boom' } } })
    await expect(readServerAnsweredCount()).rejects.toThrow('student: boom')
  })

  it('throws when the test user does not exist', async () => {
    mockTables({ users: { data: null, error: null } })
    await expect(readServerAnsweredCount()).rejects.toThrow('no user e2e-test@lmsplus.local')
  })

  it('throws when the active session lookup fails', async () => {
    mockTables({ users: OK_STUDENT, quiz_sessions: { data: null, error: { message: 'bad' } } })
    await expect(readServerAnsweredCount()).rejects.toThrow('session: bad')
  })

  it('returns 0 when the student has no active session', async () => {
    mockTables({ users: OK_STUDENT, quiz_sessions: { data: null, error: null } })
    await expect(readServerAnsweredCount()).resolves.toBe(0)
  })

  it('throws when the answered rows lookup fails', async () => {
    mockTables({
      users: OK_STUDENT,
      quiz_sessions: OK_SESSION,
      quiz_session_progress: { data: null, error: { message: 'nope' } },
    })
    await expect(readServerAnsweredCount()).rejects.toThrow('rows: nope')
  })

  it('counts the answered rows of the active session', async () => {
    mockTables({
      users: OK_STUDENT,
      quiz_sessions: OK_SESSION,
      quiz_session_progress: { data: [{ question_id: 'a' }, { question_id: 'b' }], error: null },
    })
    await expect(readServerAnsweredCount()).resolves.toBe(2)
  })

  it('returns 0 when the progress query yields no rows payload', async () => {
    mockTables({
      users: OK_STUDENT,
      quiz_sessions: OK_SESSION,
      quiz_session_progress: { data: null, error: null },
    })
    await expect(readServerAnsweredCount()).resolves.toBe(0)
  })
})

describe('submitFirstOption', () => {
  it('waits for the first option, clicks it, then clicks the first Submit Answer button', async () => {
    const calls: string[] = []
    const first = {
      waitFor: vi.fn(async () => {
        calls.push('wait')
      }),
      click: vi.fn(async () => {
        calls.push('option')
      }),
    }
    const submit = {
      click: vi.fn(async () => {
        calls.push('submit')
      }),
    }
    const page = {
      locator: vi.fn(() => ({ first: () => first })),
      getByRole: vi.fn(() => ({ first: () => submit })),
    }
    await submitFirstOption(page as never)
    expect(calls).toEqual(['wait', 'option', 'submit'])
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Submit Answer' })
  })
})

describe('clearQuizActiveSessionKeys', () => {
  it('removes only the quiz-active-session keys from localStorage', async () => {
    const store: Record<string, string> = {
      'quiz-active-session:a': '1',
      'quiz-active-session:b': '2',
      other: '3',
    }
    Object.defineProperty(store, 'removeItem', {
      enumerable: false,
      value: (k: string) => {
        delete store[k]
      },
    })
    vi.stubGlobal('localStorage', store)
    const page = { evaluate: async (fn: () => void) => fn() }
    await clearQuizActiveSessionKeys(page as never)
    vi.unstubAllGlobals()
    expect(Object.keys(store)).toEqual(['other'])
  })
})
