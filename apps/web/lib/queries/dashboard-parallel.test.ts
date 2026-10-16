import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionUser, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import { getDashboardData } from './dashboard'

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return () => buildChain(returnValue)
    },
  })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const SUBJECT = { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }

function rpcCalled(fn: string) {
  return mockRpc.mock.calls.some((c) => c[1] === fn)
}

function setRpcs(overrides: Record<string, Promise<unknown>>) {
  mockRpc.mockImplementation((_s: unknown, fn: string) => {
    const pending = overrides[fn]
    if (pending) return pending
    if (fn === 'get_student_streak') {
      return Promise.resolve({ data: [{ current_streak: 0, best_streak: 0 }], error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetSessionUser.mockResolvedValue({ id: 'u1' })
})

describe('getDashboardData parallel reads', () => {
  it('starts the mastery read while the subjects read is still pending', async () => {
    const subjects = deferred<unknown>()
    mockFrom.mockImplementation((table: string) =>
      table === 'easa_subjects' ? buildChain(subjects.promise) : buildChain({ count: 0 }),
    )
    setRpcs({})

    const result = getDashboardData()
    await vi.waitFor(() => expect(mockFrom).toHaveBeenCalledWith('easa_subjects'))
    await new Promise((r) => setTimeout(r, 10))
    expect(rpcCalled('get_student_mastery_stats')).toBe(true)

    subjects.resolve({ data: [SUBJECT] })
    await result
  })

  it('starts the last-practiced read while the mastery read is still pending', async () => {
    const mastery = deferred<unknown>()
    mockFrom.mockImplementation((table: string) =>
      table === 'easa_subjects' ? buildChain({ data: [SUBJECT] }) : buildChain({ count: 0 }),
    )
    setRpcs({ get_student_mastery_stats: mastery.promise })

    const result = getDashboardData()
    await vi.waitFor(() => expect(rpcCalled('get_student_mastery_stats')).toBe(true))
    await new Promise((r) => setTimeout(r, 10))
    expect(rpcCalled('get_student_last_practiced')).toBe(true)

    mastery.resolve({ data: [], error: null })
    await result
  })
})
