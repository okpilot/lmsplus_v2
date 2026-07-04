import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closePracticeSessionForDraft } from './draft-helpers'

// ---- Helpers ----------------------------------------------------------------

/**
 * Proxy-based chain builder. All chained method calls return the proxy itself;
 * `.select()` is the terminal that returns `result`. Non-thenable (no `.then`).
 */
function buildChain(result: unknown) {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') return undefined
        if (prop === 'select') return () => result
        return () => proxy
      },
    },
  )
  return proxy
}

type FakeClient = Parameters<typeof closePracticeSessionForDraft>[0]

function makeClient(result: unknown): FakeClient {
  return { from: vi.fn().mockReturnValue(buildChain(result)) } as unknown as FakeClient
}

// ---- Fixtures ---------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000002'
const USER_ID = '00000000-0000-4000-a000-000000000001'

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('closePracticeSessionForDraft', () => {
  it('swallows a DB error and logs it without rethrowing', async () => {
    const client = makeClient({ data: null, error: { message: 'rls violation' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(closePracticeSessionForDraft(client, SESSION_ID, USER_ID)).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledWith(
      '[closePracticeSession] Session close error:',
      'rls violation',
    )
  })

  it('swallows a thrown exception and logs it without rethrowing', async () => {
    const client = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('network failure')
      }),
    } as unknown as FakeClient
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(closePracticeSessionForDraft(client, SESSION_ID, USER_ID)).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledWith('[closePracticeSession] Uncaught error:', expect.any(Error))
  })

  it('does not log anything when no matching row exists', async () => {
    const client = makeClient({ data: [], error: null })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await closePracticeSessionForDraft(client, SESSION_ID, USER_ID)

    expect(logSpy).not.toHaveBeenCalled()
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('logs the soft-delete when a practice session is successfully closed', async () => {
    const client = makeClient({ data: [{ id: SESSION_ID }], error: null })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await closePracticeSessionForDraft(client, SESSION_ID, USER_ID)

    expect(logSpy).toHaveBeenCalledWith(
      '[closePracticeSession] Session',
      SESSION_ID,
      'soft-deleted for user',
      USER_ID,
    )
  })
})
