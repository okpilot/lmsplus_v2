import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient, mockReadUserId } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
  mockReadUserId: vi.fn(),
}))

vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./recovery-code', () => ({ readUserId: mockReadUserId }))

import { seedStudentFlag, softDeleteStudentFlags } from './flags'

type Result = { error: { message: string } | null; data?: { question_id: string }[] | null }

function mockFlagTable(result: Result) {
  const calls = {
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
  }
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: required to make Supabase mock awaitable
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  chain.eq = (...a: unknown[]) => {
    calls.eq(...a)
    return chain
  }
  chain.is = (...a: unknown[]) => {
    calls.is(...a)
    return chain
  }
  chain.select = (...a: unknown[]) => {
    calls.select(...a)
    return chain
  }
  const table = {
    update: (...a: unknown[]) => {
      calls.update(...a)
      return chain
    },
    delete: (...a: unknown[]) => {
      calls.delete(...a)
      return chain
    },
    upsert: (...a: unknown[]) => {
      calls.upsert(...a)
      return chain
    },
  }
  const from = vi.fn().mockReturnValue(table)
  mockGetAdminClient.mockReturnValue({ from })
  return { calls, from }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockReadUserId.mockResolvedValue('student-1')
})

describe('softDeleteStudentFlags', () => {
  it('soft-deletes only the active flags of the student, never deletes', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { calls, from } = mockFlagTable({ error: null, data: [{ question_id: 'q-1' }] })
    await softDeleteStudentFlags('s@x.local')
    logSpy.mockRestore()
    expect(from).toHaveBeenCalledWith('flagged_questions')
    expect(calls.delete).not.toHaveBeenCalled()
    expect(calls.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) })
    expect(calls.eq).toHaveBeenCalledWith('student_id', 'student-1')
    expect(calls.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('selects the question_id of the soft-deleted rows', async () => {
    const { calls } = mockFlagTable({ error: null, data: [] })
    await softDeleteStudentFlags('s@x.local')
    expect(calls.select).toHaveBeenCalledWith('question_id')
  })

  it('logs nothing when zero rows were soft-deleted', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFlagTable({ error: null, data: [] })
    await softDeleteStudentFlags('s@x.local')
    expect(logSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('logs once when rows were soft-deleted', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFlagTable({ error: null, data: [{ question_id: 'a' }, { question_id: 'b' }] })
    await softDeleteStudentFlags('s@x.local')
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('[softDeleteStudentFlags] soft-deleted 2 flag(s)')
    logSpy.mockRestore()
  })

  it('throws with the email on a database error', async () => {
    mockFlagTable({ error: { message: 'boom' } })
    await expect(softDeleteStudentFlags('s@x.local')).rejects.toThrow(
      'softDeleteStudentFlags (s@x.local): boom',
    )
  })
})

describe('seedStudentFlag', () => {
  it('upserts an active flag on the composite key', async () => {
    const { calls } = mockFlagTable({ error: null })
    await seedStudentFlag('s@x.local', 'q-1')
    expect(calls.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 'student-1', question_id: 'q-1', deleted_at: null }),
      { onConflict: 'student_id,question_id' },
    )
    expect(calls.delete).not.toHaveBeenCalled()
  })

  it('throws with the email on a database error', async () => {
    mockFlagTable({ error: { message: 'boom' } })
    await expect(seedStudentFlag('s@x.local', 'q-1')).rejects.toThrow(
      'seedStudentFlag (s@x.local): boom',
    )
  })
})
