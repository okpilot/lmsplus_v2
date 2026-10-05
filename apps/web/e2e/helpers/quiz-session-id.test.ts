import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient, mockCleanupActive } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
  mockCleanupActive: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
  cleanupStudentActiveSessions: mockCleanupActive,
}))

import {
  cleanupStudentSavedSessions,
  readAnsweredQuestionIds,
  readSessionQuestionIds,
  readSessionRow,
  readSessionSubjectName,
  resetStudentQuizSessions,
  SESSION_ID_URL,
  sessionIdFromUrl,
  setSavedVisitTime,
} from './quiz-session-id'

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

const ID = '3f2b8c1e-5d4a-4b7e-9c1a-0e6d2f8a7b90'
const OK_STUDENT: Result = { data: { id: 'student-1' }, error: null }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('SESSION_ID_URL', () => {
  it('matches the runner URL of a session id', () => {
    expect(SESSION_ID_URL.test(`http://localhost:3000/app/quiz/session/${ID}`)).toBe(true)
  })

  it('does not match the id-less Discovery URL', () => {
    expect(SESSION_ID_URL.test('http://localhost:3000/app/quiz/session')).toBe(false)
  })

  it('does not match a URL that continues past the id', () => {
    expect(SESSION_ID_URL.test(`http://localhost:3000/app/quiz/session/${ID}/extra`)).toBe(false)
  })
})

describe('sessionIdFromUrl', () => {
  it('returns the id of the runner URL', () => {
    expect(sessionIdFromUrl(`http://localhost:3000/app/quiz/session/${ID}`)).toBe(ID)
  })

  it('ignores a query string after the id', () => {
    expect(sessionIdFromUrl(`http://localhost:3000/app/quiz/session/${ID}?x=1`)).toBe(ID)
  })

  it('throws for a URL without an id', () => {
    expect(() => sessionIdFromUrl('http://localhost:3000/app/quiz')).toThrow('not a quiz session')
  })
})

describe('cleanupStudentSavedSessions', () => {
  it('throws when the student lookup fails', async () => {
    mockTables({ users: { data: null, error: { message: 'boom' } } })
    await expect(cleanupStudentSavedSessions('a@b.c')).rejects.toThrow(
      'fetchRecoveryCode user (a@b.c): boom',
    )
  })

  it('throws when the student does not exist', async () => {
    mockTables({ users: { data: null, error: null } })
    await expect(cleanupStudentSavedSessions('a@b.c')).rejects.toThrow('no user row for a@b.c')
  })

  it('throws when clearing the saved marker fails', async () => {
    mockTables({ users: OK_STUDENT, quiz_sessions: { data: null, error: { message: 'nope' } } })
    await expect(cleanupStudentSavedSessions('a@b.c')).rejects.toThrow('a@b.c): nope')
  })

  it('stays silent when no session was saved', async () => {
    mockTables({ users: OK_STUDENT, quiz_sessions: { data: [], error: null } })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await cleanupStudentSavedSessions('a@b.c')
    expect(log).not.toHaveBeenCalled()
  })

  it('logs how many saved markers it cleared', async () => {
    mockTables({
      users: OK_STUDENT,
      quiz_sessions: { data: [{ id: '1' }, { id: '2' }], error: null },
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await cleanupStudentSavedSessions('a@b.c')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cleared 2 saved session(s)'))
  })
})

describe('resetStudentQuizSessions', () => {
  it('still clears saved markers when the active-session cleanup fails', async () => {
    mockCleanupActive.mockRejectedValue(new Error('active failed'))
    mockTables({ users: OK_STUDENT, quiz_sessions: { data: [], error: null } })
    await expect(resetStudentQuizSessions('a@b.c')).rejects.toThrow('active failed')
    expect(mockGetAdminClient).toHaveBeenCalled()
  })

  it('reports every failed step together', async () => {
    mockCleanupActive.mockRejectedValue(new Error('active failed'))
    mockTables({ users: { data: null, error: { message: 'saved failed' } } })
    await expect(resetStudentQuizSessions('a@b.c')).rejects.toThrow(/active failed; .*saved failed/)
  })

  it('resolves when both steps succeed', async () => {
    mockCleanupActive.mockResolvedValue(undefined)
    mockTables({ users: OK_STUDENT, quiz_sessions: { data: [], error: null } })
    await expect(resetStudentQuizSessions('a@b.c')).resolves.toBeUndefined()
  })
})

describe('readSessionRow', () => {
  it('throws when the lookup fails', async () => {
    mockTables({ quiz_sessions: { data: null, error: { message: 'bad' } } })
    await expect(readSessionRow(ID)).rejects.toThrow('readSessionRow: bad')
  })

  it('throws when the session does not exist', async () => {
    mockTables({ quiz_sessions: { data: null, error: null } })
    await expect(readSessionRow(ID)).rejects.toThrow(`no session ${ID}`)
  })

  it('maps the row to camelCase fields', async () => {
    mockTables({
      quiz_sessions: {
        data: {
          current_index: 3,
          pinned_question_ids: ['p1', 'p2'],
          ended_at: null,
          deleted_at: 'd',
          saved_at: 's',
        },
        error: null,
      },
    })
    await expect(readSessionRow(ID)).resolves.toEqual({
      currentIndex: 3,
      pinnedCount: 2,
      endedAt: null,
      deletedAt: 'd',
      savedAt: 's',
    })
  })
})

describe('readAnsweredQuestionIds', () => {
  it('throws when the lookup fails', async () => {
    mockTables({ quiz_session_progress: { data: null, error: { message: 'bad' } } })
    await expect(readAnsweredQuestionIds(ID)).rejects.toThrow('readAnsweredQuestionIds: bad')
  })

  it('returns the question ids of the answered rows', async () => {
    mockTables({
      quiz_session_progress: { data: [{ question_id: 'a' }, { question_id: 'b' }], error: null },
    })
    await expect(readAnsweredQuestionIds(ID)).resolves.toEqual(['a', 'b'])
  })

  it('returns an empty list when the payload is null', async () => {
    mockTables({ quiz_session_progress: { data: null, error: null } })
    await expect(readAnsweredQuestionIds(ID)).resolves.toEqual([])
  })
})

describe('setSavedVisitTime', () => {
  const opts = { sessionId: ID, questionId: 'q1', timeSpentMs: 5000 }

  it('throws when the update fails', async () => {
    mockTables({ quiz_session_progress: { data: null, error: { message: 'bad' } } })
    await expect(setSavedVisitTime(opts)).rejects.toThrow('setSavedVisitTime: bad')
  })

  it('throws when no row matched, so a wrong id cannot pass silently', async () => {
    mockTables({ quiz_session_progress: { data: [], error: null } })
    await expect(setSavedVisitTime(opts)).rejects.toThrow('no row for q1')
  })

  it('resolves when the row was updated', async () => {
    mockTables({ quiz_session_progress: { data: [{ question_id: 'q1' }], error: null } })
    await expect(setSavedVisitTime(opts)).resolves.toBeUndefined()
  })
})

describe('readSessionQuestionIds', () => {
  it('throws when the lookup fails', async () => {
    mockTables({ quiz_sessions: { data: null, error: { message: 'bad' } } })
    await expect(readSessionQuestionIds(ID)).rejects.toThrow('readSessionQuestionIds: bad')
  })

  it('throws when the config carries no question list', async () => {
    mockTables({ quiz_sessions: { data: { config: {} }, error: null } })
    await expect(readSessionQuestionIds(ID)).rejects.toThrow('no question_ids')
  })

  it('throws when the question list holds a non-string', async () => {
    mockTables({ quiz_sessions: { data: { config: { question_ids: ['a', 2] } }, error: null } })
    await expect(readSessionQuestionIds(ID)).rejects.toThrow('no question_ids')
  })

  it('returns the served question ids in order', async () => {
    mockTables({ quiz_sessions: { data: { config: { question_ids: ['a', 'b'] } }, error: null } })
    await expect(readSessionQuestionIds(ID)).resolves.toEqual(['a', 'b'])
  })
})

describe('readSessionSubjectName', () => {
  it('throws when the lookup fails', async () => {
    mockTables({ quiz_sessions: { data: null, error: { message: 'bad' } } })
    await expect(readSessionSubjectName(ID)).rejects.toThrow('readSessionSubjectName: bad')
  })

  it('throws when the session has no subject', async () => {
    mockTables({ quiz_sessions: { data: { easa_subjects: null }, error: null } })
    await expect(readSessionSubjectName(ID)).rejects.toThrow(ID)
  })

  it('returns the subject name', async () => {
    mockTables({
      quiz_sessions: { data: { easa_subjects: { name: 'Meteorology' } }, error: null },
    })
    await expect(readSessionSubjectName(ID)).resolves.toBe('Meteorology')
  })
})
