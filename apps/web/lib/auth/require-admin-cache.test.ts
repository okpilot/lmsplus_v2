import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn())
const mockCreateServerSupabaseClient = vi.hoisted(() => vi.fn())
const cacheStore = vi.hoisted(() => new Map<unknown, unknown>())

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

// This tier resolves React's CLIENT build, whose `cache` is an unconditional
// passthrough — so the real per-request memo is unreachable here and no config
// change can reach it (neither vitest config sets `resolve.conditions`).
// Substituting a memo of our own lets this tier observe the one property that
// matters for #1169: that requireAdmin is routed THROUGH `cache` at all, and so
// evaluates once per scope. That the scope is per-request is a property of
// React's server build, established by source review, not by this test.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache:
      (fn: (...args: never[]) => unknown) =>
      (...args: never[]) => {
        if (!cacheStore.has(fn)) cacheStore.set(fn, fn(...args))
        return cacheStore.get(fn)
      },
  }
})

import { requireAdmin } from './require-admin'

describe('requireAdmin per-request memoization', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Required: the mock factory runs once per file, so the memo outlives
    // vi.resetAllMocks() — which resets mock state but cannot see this Map.
    cacheStore.clear()
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: 'admin', organization_id: 'org-1' },
              error: null,
            }),
          }),
        }),
      }),
    })
  })

  it('calls getUser once when invoked twice in the same request', async () => {
    const first = await requireAdmin()
    const second = await requireAdmin()

    expect(mockGetUser).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('resolves the same organization id to every caller in one request', async () => {
    const [a, b] = await Promise.all([requireAdmin(), requireAdmin()])

    expect(a.organizationId).toBe('org-1')
    expect(b.organizationId).toBe('org-1')
    expect(mockCreateServerSupabaseClient).toHaveBeenCalledTimes(1)
  })
})
