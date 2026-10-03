import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../helpers/supabase', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

import { clearOpenSessions } from './clear-open-sessions'

function buildRecordingChain(
  returnValue: unknown,
  calls: Array<{ method: string; args: unknown[] }>,
): unknown {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        return buildRecordingChain(returnValue, calls)
      }
    },
  })
}

const adminMock = { from: mockFrom } as unknown as Parameters<typeof clearOpenSessions>[0]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('clearOpenSessions', () => {
  it("soft-deletes only the student's open sessions", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    mockFrom.mockReturnValue(buildRecordingChain({ data: [], error: null }, calls))

    await clearOpenSessions(adminMock, 'stu-1', 'tag')

    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
    expect(calls.map((c) => c.method)).toEqual(['update', 'eq', 'is', 'is', 'select'])
    expect(calls[0]?.args[0]).toEqual({ deleted_at: expect.any(String) })
    expect(calls[1]?.args).toEqual(['student_id', 'stu-1'])
    expect(calls[2]?.args).toEqual(['ended_at', null])
    expect(calls[3]?.args).toEqual(['deleted_at', null])
  })

  it('throws when the update fails', async () => {
    mockFrom.mockReturnValue(buildRecordingChain({ data: null, error: { message: 'boom' } }, []))

    await expect(clearOpenSessions(adminMock, 'stu-1', 'tag')).rejects.toThrow(
      'clearOpenSessions: boom',
    )
  })

  it('stays silent when no session was open', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    mockFrom.mockReturnValue(buildRecordingChain({ data: [], error: null }, []))

    await clearOpenSessions(adminMock, 'stu-1', 'tag')

    expect(info).not.toHaveBeenCalled()
  })

  it('logs the cleared count under the caller tag', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    mockFrom.mockReturnValue(
      buildRecordingChain({ data: [{ id: 'a' }, { id: 'b' }], error: null }, []),
    )

    await clearOpenSessions(adminMock, 'stu-1', 'saved-quiz')

    expect(info).toHaveBeenCalledWith('[saved-quiz] cleared 2 session(s)')
  })
})
