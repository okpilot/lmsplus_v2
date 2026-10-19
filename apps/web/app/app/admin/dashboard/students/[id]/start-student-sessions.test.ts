import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentSessionFilters } from '../../types'

// A plain function, not vi.fn(): the spy wrapper attaches its own handler to a returned promise, which would mask an unhandled rejection.
const reads = vi.hoisted(() => ({
  calls: [] as unknown[][],
  next: (() => Promise.resolve(undefined)) as () => Promise<unknown>,
}))

vi.mock('./queries', () => ({
  getStudentSessions: (...args: unknown[]) => {
    reads.calls.push(args)
    return reads.next()
  },
}))

import { startStudentSessions } from './start-student-sessions'

const ID = '11111111-1111-4111-8111-111111111111'
const filters = { page: 1 } as unknown as StudentSessionFilters

describe('startStudentSessions', () => {
  beforeEach(() => {
    reads.calls = []
  })

  it('returns the sessions the read resolves', async () => {
    const value = { sessions: [], totalCount: 0 }
    reads.next = () => Promise.resolve(value)

    await expect(startStudentSessions(ID, filters)).resolves.toBe(value)
    expect(reads.calls).toEqual([[ID, filters]])
  })

  it('passes a failed sessions read on to whoever awaits it', async () => {
    reads.next = () => Promise.reject(new Error('Failed to fetch student sessions'))

    await expect(startStudentSessions(ID, filters)).rejects.toThrow(
      'Failed to fetch student sessions',
    )
  })

  it('a failed sessions read nobody awaits raises no unhandled rejection', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      reads.next = () => Promise.reject(new Error('Failed to fetch student sessions'))
      startStudentSessions(ID, filters)
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
