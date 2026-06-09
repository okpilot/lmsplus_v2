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
import { expectAuditRow, expectCompletionMetadata } from './audit-helpers'

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
})
