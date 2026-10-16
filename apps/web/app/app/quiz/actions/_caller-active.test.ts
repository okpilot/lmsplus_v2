import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callerStatus, resolveZeroRowWrite } from './_caller-active'

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

type MockSupabase = Parameters<typeof callerStatus>[0]

function makeSupabase(returnValue: unknown): MockSupabase {
  return { from: () => buildChain(returnValue) } as unknown as MockSupabase
}

const USER_ID = '00000000-0000-4000-a000-000000000001'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('callerStatus', () => {
  it('reports active when the caller can see their own users row', async () => {
    const supabase = makeSupabase({ data: { id: USER_ID }, error: null })
    expect(await callerStatus(supabase, USER_ID, 'someAction')).toBe('active')
  })

  it('reports inactive when the caller cannot see their own users row', async () => {
    const supabase = makeSupabase({ data: null, error: null })
    expect(await callerStatus(supabase, USER_ID, 'someAction')).toBe('inactive')
  })

  it('reports an error and logs when the lookup errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } })

    expect(await callerStatus(supabase, USER_ID, 'someAction')).toBe('error')
    expect(consoleSpy).toHaveBeenCalledWith('[someAction] Caller lookup error:', 'boom', 'XX000')
  })
})

describe('resolveZeroRowWrite', () => {
  const OPTS = { userId: USER_ID, tag: 'someAction', whenActive: 'ok', whenInactive: 'refused' }

  it('returns the active result when the caller is active', async () => {
    const supabase = makeSupabase({ data: { id: USER_ID }, error: null })
    expect(await resolveZeroRowWrite(supabase, OPTS)).toBe('ok')
  })

  it('returns the inactive result and logs when the caller is not active', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ data: null, error: null })
    expect(await resolveZeroRowWrite(supabase, OPTS)).toBe('refused')
    expect(consoleSpy).toHaveBeenCalledWith('[someAction] Write refused: caller not active')
  })

  it('returns the error result without a not-active log when the lookup errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } })
    const result = await resolveZeroRowWrite(supabase, { ...OPTS, whenError: 'failed' })
    expect(result).toBe('failed')
    expect(consoleSpy).toHaveBeenCalledWith('[someAction] Caller lookup error:', 'boom', 'XX000')
    expect(consoleSpy).not.toHaveBeenCalledWith('[someAction] Write refused: caller not active')
  })

  it('falls back to the inactive result when the lookup errors and no error result is given', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } })
    expect(await resolveZeroRowWrite(supabase, OPTS)).toBe('refused')
  })
})
