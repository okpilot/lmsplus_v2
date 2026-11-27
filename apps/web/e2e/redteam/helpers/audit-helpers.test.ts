import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Supabase admin-client mock — the real `e2e/helpers/supabase.ts` throws at
// module-import time if SUPABASE_SERVICE_ROLE_KEY isn't set (intended for
// live Playwright E2E runs, not jsdom unit tests). Mock before importing.
// ---------------------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())
const mockExpect = vi.hoisted(() => vi.fn())

vi.mock('../../helpers/supabase', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// Playwright's `expect` is imported by audit-helpers.ts; replace with vitest
// expect so assertions work in the jsdom test environment.
vi.mock('@playwright/test', () => ({
  expect: (actual: unknown, message?: string) => ({
    toBeNull: () => {
      mockExpect(actual, message)
      if (actual !== null) throw new Error(message ?? `Expected null, got ${String(actual)}`)
    },
    toBeGreaterThan: (n: number) => {
      mockExpect(actual, message)
      if (typeof actual !== 'number' || actual <= n)
        throw new Error(message ?? `Expected ${String(actual)} > ${n}`)
    },
    toHaveProperty: (key: string) => {
      mockExpect(actual, message)
      if (typeof actual !== 'object' || actual === null || !(key in (actual as object)))
        throw new Error(message ?? `Expected property '${key}'`)
    },
    not: {
      toHaveProperty: (key: string) => {
        mockExpect(actual, message)
        if (typeof actual === 'object' && actual !== null && key in (actual as object))
          throw new Error(message ?? `Did not expect property '${key}'`)
      },
    },
    toBeTruthy: () => {
      mockExpect(actual, message)
      if (!actual) throw new Error(message ?? `Expected truthy, got ${String(actual)}`)
    },
  }),
}))

// Must import AFTER vi.mock calls (vitest hoists them automatically).
import {
  expectAuditRow,
  expectCompletionMetadata,
  insertFixtureCode,
  readAuditReason,
} from './audit-helpers'

// ---------------------------------------------------------------------------
// buildChain — mirrors the project-wide pattern (see seed.test.ts / proxy.test.ts)
// ---------------------------------------------------------------------------
function buildChain(returnValue: unknown): unknown {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
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

const adminMock = { from: mockFrom } as unknown as Parameters<typeof expectAuditRow>[0]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('expectAuditRow', () => {
  it('passes when the query returns at least one matching audit row', async () => {
    const rows = [
      {
        id: 'evt-1',
        event_type: 'exam.started',
        actor_id: 'user-1',
        resource_id: 'sess-1',
        created_at: '2026-01-01',
      },
    ]
    mockFrom.mockReturnValueOnce(buildChain({ data: rows, error: null }))

    // Should resolve without throwing
    await expect(
      expectAuditRow(adminMock, 'exam.started', 'user-1', '2026-01-01T00:00:00Z', 'sess-1'),
    ).resolves.toBeUndefined()
  })

  it('throws when the query returns zero rows', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: [], error: null }))

    await expect(
      expectAuditRow(adminMock, 'exam.started', 'user-1', '2026-01-01T00:00:00Z'),
    ).rejects.toThrow(/expected at least one exam\.started audit row/)
  })

  it('throws when the query returns an error', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'connection refused' } }),
    )

    await expect(
      expectAuditRow(adminMock, 'exam.started', 'user-1', '2026-01-01T00:00:00Z'),
    ).rejects.toThrow(/audit_events query error for exam\.started/)
  })
})

describe('expectCompletionMetadata', () => {
  it('passes when metadata has answered_count and correct_count but not answered/correct', async () => {
    const rows = [
      {
        metadata: {
          answered_count: 5,
          correct_count: 3,
        },
      },
    ]
    mockFrom.mockReturnValueOnce(buildChain({ data: rows, error: null }))

    await expect(
      expectCompletionMetadata(adminMock, {
        eventType: 'exam.completed',
        actorId: 'user-1',
        testStart: '2026-01-01T00:00:00Z',
        sessionId: 'sess-1',
      }),
    ).resolves.toBeUndefined()
  })

  it('throws when metadata contains the legacy "answered" key', async () => {
    const rows = [
      {
        metadata: {
          answered: 5,
          correct: 3,
        },
      },
    ]
    mockFrom.mockReturnValueOnce(buildChain({ data: rows, error: null }))

    await expect(
      expectCompletionMetadata(adminMock, {
        eventType: 'exam.completed',
        actorId: 'user-1',
        testStart: '2026-01-01T00:00:00Z',
        sessionId: 'sess-1',
      }),
    ).rejects.toThrow(/answered_count/)
  })

  it('throws when the metadata query returns an error', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: null, error: { message: 'network error' } }))

    await expect(
      expectCompletionMetadata(adminMock, {
        eventType: 'exam.completed',
        actorId: 'user-1',
        testStart: '2026-01-01T00:00:00Z',
        sessionId: 'sess-1',
      }),
    ).rejects.toThrow(/exam\.completed metadata query error/)
  })

  it('throws when the query returns zero rows (no matching audit event written yet)', async () => {
    // data: [] — no error, but no row → data?.[0]?.metadata resolves to undefined → {}
    // The {} object lacks answered_count so the toHaveProperty assertion fires.
    mockFrom.mockReturnValueOnce(buildChain({ data: [], error: null }))

    await expect(
      expectCompletionMetadata(adminMock, {
        eventType: 'exam.completed',
        actorId: 'user-1',
        testStart: '2026-01-01T00:00:00Z',
        sessionId: 'sess-1',
      }),
    ).rejects.toThrow(/answered_count/)
  })
})

describe('readAuditReason', () => {
  it('returns the metadata reason of the matching audit event', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: { metadata: { reason: 'submission past grace period' } }, error: null }),
    )

    await expect(readAuditReason(adminMock, 'exam.expired', 'sess-1')).resolves.toBe(
      'submission past grace period',
    )
  })

  it('returns undefined when no audit event matches', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: null, error: null }))

    await expect(readAuditReason(adminMock, 'exam.expired', 'sess-1')).resolves.toBeUndefined()
  })

  it('throws when the query fails', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: null, error: { message: 'down' } }))

    await expect(readAuditReason(adminMock, 'exam.expired', 'sess-1')).rejects.toThrow(
      /readAuditReason exam\.expired: down/,
    )
  })
})

describe('insertFixtureCode', () => {
  const OPTS = { orgId: 'org-1', subjectId: 'sub-1', studentId: 'stu-1', issuedBy: 'adm-1' }

  function mockInsert(result: unknown) {
    const insert = vi.fn().mockReturnValue(buildChain(result))
    mockFrom.mockReturnValueOnce({ insert })
    return insert
  }

  it('inserts a sitting-less code row and tracks its id', async () => {
    const insert = mockInsert({ data: { id: 'code-1' }, error: null })
    const ids = new Set<string>()

    const out = await insertFixtureCode(adminMock, OPTS, ids)

    expect(mockFrom).toHaveBeenCalledWith('internal_exam_codes')
    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row).toMatchObject({
      subject_id: 'sub-1',
      student_id: 'stu-1',
      issued_by: 'adm-1',
      organization_id: 'org-1',
    })
    expect(row.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(row).not.toHaveProperty('sitting_entry_id')
    expect(out).toEqual({ codeId: 'code-1', code: row.code })
    expect([...ids]).toEqual(['code-1'])
  })

  it('throws and tracks nothing when the insert fails', async () => {
    mockInsert({ data: null, error: { message: 'denied' } })
    const ids = new Set<string>()

    await expect(insertFixtureCode(adminMock, OPTS, ids)).rejects.toThrow(
      'insertFixtureCode: denied',
    )
    expect(ids.size).toBe(0)
  })

  it('throws when no row is returned', async () => {
    mockInsert({ data: null, error: null })

    await expect(insertFixtureCode(adminMock, OPTS, new Set())).rejects.toThrow(
      'insertFixtureCode: no row',
    )
  })
})
