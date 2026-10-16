import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockFetchAllRows, mockRequireAdmin, cacheStore } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetchAllRows: vi.fn(),
  mockRequireAdmin: vi.fn(),
  cacheStore: new Map<unknown, unknown>(),
}))

// The client build of React's `cache` is a passthrough in this tier; substitute a memo keyed
// on the first argument so the test can observe that the loader is routed through `cache`.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache:
    (fn: (...args: never[]) => unknown) =>
    (...args: never[]) => {
      if (!cacheStore.has(args[0])) cacheStore.set(args[0], fn(...args))
      return cacheStore.get(args[0])
    },
}))

vi.mock('@/lib/supabase-paginate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase-paginate')>()),
  fetchAllRows: mockFetchAllRows,
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { loadAdminReportSession } from './admin-report-session'

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const calls: [string, unknown[]][] = []
  const proxy: Record<string, unknown> = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls.push([String(prop), args])
        return proxy
      }
    },
  })
  return { proxy, calls }
}

const sessionRow = {
  id: 'sess-1',
  mode: 'quick_quiz',
  subject_id: null,
  started_at: '2026-03-12T10:00:00Z',
  ended_at: '2026-03-12T10:05:00Z',
  total_questions: 2,
  correct_count: 1,
  score_percentage: 50,
  student_id: 'stu-1',
  passed: null,
  time_limit_seconds: null,
}

const answerRows = [
  { question_id: 'q1', answered_at: '2026-03-12T10:01:00Z' },
  { question_id: 'q2', answered_at: '2026-03-12T10:02:00Z' },
]

let sessionCalls: [string, unknown[]][]

function sessionResponse(response: unknown) {
  const { proxy, calls } = buildChain(response)
  sessionCalls = calls
  mockFrom.mockImplementation(() => proxy)
}

beforeEach(() => {
  vi.resetAllMocks()
  cacheStore.clear()
  mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1', organizationId: 'org-1' })
})

describe('loadAdminReportSession', () => {
  it('is not ok and reads nothing when the session id is empty', async () => {
    expect(await loadAdminReportSession('')).toEqual({ ok: false })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockFetchAllRows).not.toHaveBeenCalled()
  })

  it('reads the session and answer rows once when the same report session is loaded twice in a request', async () => {
    sessionResponse({ data: sessionRow })
    mockFetchAllRows.mockResolvedValue({ data: answerRows, error: null })
    const first = await loadAdminReportSession('sess-1')
    const second = await loadAdminReportSession('sess-1')
    expect(second).toEqual(first)
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFetchAllRows).toHaveBeenCalledTimes(1)
  })

  it('scopes the session read to the admin organization and excludes soft-deleted sessions', async () => {
    sessionResponse({ data: null })
    await loadAdminReportSession('sess-1')
    expect(sessionCalls).toContainEqual(['eq', ['id', 'sess-1']])
    expect(sessionCalls).toContainEqual(['eq', ['organization_id', 'org-1']])
    expect(sessionCalls).toContainEqual(['is', ['deleted_at', null]])
  })

  it('is not ok and reads no answers when the session is missing, foreign or deleted', async () => {
    sessionResponse({ data: null })
    expect(await loadAdminReportSession('sess-1')).toEqual({ ok: false })
    expect(mockFetchAllRows).not.toHaveBeenCalled()
  })

  it('is not ok and reads no answers when the session is still active', async () => {
    sessionResponse({ data: { ...sessionRow, ended_at: null } })
    expect(await loadAdminReportSession('sess-1')).toEqual({ ok: false })
    expect(mockFetchAllRows).not.toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('is not ok when the session read fails', async () => {
    sessionResponse({ data: null, error: { message: 'db error' } })
    expect(await loadAdminReportSession('sess-1')).toEqual({ ok: false })
    expect(mockFetchAllRows).not.toHaveBeenCalled()
  })

  it('returns the session row and its answer rows for an ended session', async () => {
    sessionResponse({ data: sessionRow })
    mockFetchAllRows.mockResolvedValue({ data: answerRows, error: null })
    expect(await loadAdminReportSession('sess-1')).toEqual({
      ok: true,
      session: sessionRow,
      answerRows,
    })
  })

  it('pages the answer rows in answered order with the id tiebreaker', async () => {
    mockFetchAllRows.mockImplementation(async (_count, page) => {
      await page(0, 9)
      return { data: answerRows, error: null }
    })
    const { proxy, calls } = buildChain({ data: [], error: null })
    mockFrom.mockImplementationOnce(() => buildChain({ data: sessionRow }).proxy)
    mockFrom.mockImplementation(() => proxy)
    await loadAdminReportSession('sess-1')
    expect(calls).toContainEqual(['select', ['question_id, answered_at']])
    expect(calls).toContainEqual(['order', ['answered_at', { ascending: true }]])
    expect(calls).toContainEqual(['order', ['id', { ascending: true }]])
    expect(calls).toContainEqual(['range', [0, 9]])
  })

  it('is not ok when the answer-rows count fails', async () => {
    sessionResponse({ data: sessionRow })
    mockFetchAllRows.mockResolvedValue({ data: [], error: { message: 'count failed' } })
    expect(await loadAdminReportSession('sess-1')).toEqual({ ok: false })
  })

  it('is not ok when an answer-rows page fails after a successful count', async () => {
    sessionResponse({ data: sessionRow })
    mockFetchAllRows.mockResolvedValue({ data: [], error: { message: 'page-level DB timeout' } })
    expect(await loadAdminReportSession('sess-1')).toEqual({ ok: false })
  })
})
