import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@repo/db/server', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@repo/db/test-helpers', () => ({
  cleanupReferenceData: vi.fn(),
  cleanupTestData: vi.fn(),
  createTestOrg: vi.fn(),
  createTestUser: vi.fn(),
  getAdminClient: vi.fn(),
  getAuthenticatedClient: vi.fn(),
  seedQuestions: vi.fn(),
  seedReferenceData: vi.fn(),
}))

import { clearActiveSessions } from './harness'

const mockFrom = vi.fn()
const mockIn = vi.fn()
const admin = { from: mockFrom } as unknown as Parameters<typeof clearActiveSessions>[0]['admin']

function queryChain() {
  const chain: Record<string, unknown> = {}
  for (const m of ['update', 'is']) chain[m] = () => chain
  chain.in = (...args: unknown[]) => {
    mockIn(...args)
    return chain
  }
  chain.select = () => Promise.resolve({ data: [{ id: 's-1' }], error: null })
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFrom.mockImplementation(() => queryChain())
})

describe('clearActiveSessions', () => {
  it('returns 0 without querying when every student id is undefined', async () => {
    await expect(clearActiveSessions({ admin, studentIds: [undefined] })).resolves.toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('scopes the update to the defined student ids only', async () => {
    await expect(clearActiveSessions({ admin, studentIds: ['u-1', undefined] })).resolves.toBe(1)
    expect(mockIn).toHaveBeenCalledWith('student_id', ['u-1'])
  })
})
