import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
}))

import { cleanupMarkedDrafts, countMarkedDrafts, seedMarkedDraft } from './quiz-draft'

function buildChain(
  returnValue: unknown,
  calls: { table: string; method: string }[],
  table: string,
) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: required to make Supabase mock awaitable
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => {
        calls.push({ table, method: String(prop) })
        return buildChain(returnValue, calls, table)
      }
    },
  })
}

type Result = { data: unknown; error: { message: string } | null }

function mockTables(tables: Record<string, Result>) {
  const calls: { table: string; method: string }[] = []
  mockGetAdminClient.mockReturnValue({
    from: (table: string) => buildChain(tables[table] ?? { data: null, error: null }, calls, table),
  })
  return calls
}

const STUDENT: Result = { data: { id: 'student-1', organization_id: 'org-1' }, error: null }
const THREE_QUESTIONS: Result = { data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }], error: null }

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

describe('seedMarkedDraft', () => {
  it('returns the id of the inserted draft', async () => {
    mockTables({
      users: STUDENT,
      questions: THREE_QUESTIONS,
      quiz_drafts: { data: { id: 'draft-1' }, error: null },
    })

    await expect(seedMarkedDraft('s@x.test', 'label')).resolves.toBe('draft-1')
  })

  it('throws when the student lookup fails', async () => {
    mockTables({ users: { data: null, error: { message: 'boom' } } })

    await expect(seedMarkedDraft('s@x.test', 'label')).rejects.toThrow(
      'quiz-draft student lookup: boom',
    )
  })

  it('throws when no user has the email', async () => {
    mockTables({ users: { data: null, error: null } })

    await expect(seedMarkedDraft('s@x.test', 'label')).rejects.toThrow(
      'quiz-draft: no user s@x.test',
    )
  })

  it('throws when the questions read fails', async () => {
    mockTables({ users: STUDENT, questions: { data: null, error: { message: 'q down' } } })

    await expect(seedMarkedDraft('s@x.test', 'label')).rejects.toThrow(
      'seedMarkedDraft questions: q down',
    )
  })

  it('throws when fewer than three questions exist', async () => {
    mockTables({ users: STUDENT, questions: { data: [{ id: 'q1' }], error: null } })

    await expect(seedMarkedDraft('s@x.test', 'label')).rejects.toThrow(
      'seedMarkedDraft: need 3 questions',
    )
  })

  it('throws when the draft insert fails', async () => {
    mockTables({
      users: STUDENT,
      questions: THREE_QUESTIONS,
      quiz_drafts: { data: null, error: { message: 'insert down' } },
    })

    await expect(seedMarkedDraft('s@x.test', 'label')).rejects.toThrow(
      'seedMarkedDraft insert: insert down',
    )
  })
})

describe('countMarkedDrafts', () => {
  it('counts the marked drafts of the student', async () => {
    mockTables({ users: STUDENT, quiz_drafts: { data: [{ id: 'a' }, { id: 'b' }], error: null } })

    await expect(countMarkedDrafts('s@x.test')).resolves.toBe(2)
  })

  it('counts zero when the read returns no rows', async () => {
    mockTables({ users: STUDENT, quiz_drafts: { data: null, error: null } })

    await expect(countMarkedDrafts('s@x.test')).resolves.toBe(0)
  })

  it('throws when the count read fails', async () => {
    mockTables({ users: STUDENT, quiz_drafts: { data: null, error: { message: 'read down' } } })

    await expect(countMarkedDrafts('s@x.test')).rejects.toThrow('countMarkedDrafts: read down')
  })
})

describe('cleanupMarkedDrafts', () => {
  it('stays silent when no marked draft exists', async () => {
    mockTables({ users: STUDENT, quiz_drafts: { data: [], error: null } })

    await cleanupMarkedDrafts('s@x.test')

    expect(logSpy).not.toHaveBeenCalled()
  })

  it('logs how many drafts it removed', async () => {
    mockTables({ users: STUDENT, quiz_drafts: { data: [{ id: 'a' }, { id: 'b' }], error: null } })

    await cleanupMarkedDrafts('s@x.test')

    expect(logSpy).toHaveBeenCalledWith('[cleanupMarkedDrafts] removed 2 draft(s)')
  })

  it('throws when the delete fails', async () => {
    mockTables({ users: STUDENT, quiz_drafts: { data: null, error: { message: 'del down' } } })

    await expect(cleanupMarkedDrafts('s@x.test')).rejects.toThrow('cleanupMarkedDrafts: del down')
  })

  it('deletes only the rows carrying the e2e marker', async () => {
    const calls = mockTables({ users: STUDENT, quiz_drafts: { data: [], error: null } })

    await cleanupMarkedDrafts('s@x.test')

    expect(calls.filter((c) => c.table === 'quiz_drafts').map((c) => c.method)).toEqual([
      'delete',
      'eq',
      'like',
      'select',
    ])
  })
})
