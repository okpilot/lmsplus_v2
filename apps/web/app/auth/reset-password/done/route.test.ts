import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const { mockClear, mockRedirect } = vi.hoisted(() => ({
  mockClear: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@/lib/auth/recovery-pending-cookie', () => ({
  clearRecoveryPendingCookie: mockClear,
}))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

describe('GET /auth/reset-password/done', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockClear.mockResolvedValue(undefined)
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    })
  })

  it('lifts the recovery pin and redirects to the root', async () => {
    await expect(GET()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockClear).toHaveBeenCalledTimes(1)
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('clears the recovery pin before redirecting', async () => {
    const order: string[] = []
    mockClear.mockImplementation(async () => {
      order.push('clear')
    })
    mockRedirect.mockImplementation(() => {
      order.push('redirect')
      throw new Error('NEXT_REDIRECT')
    })
    await expect(GET()).rejects.toThrow()
    expect(order).toEqual(['clear', 'redirect'])
  })

  it('does not redirect when clearing the pin fails', async () => {
    mockClear.mockRejectedValue(new Error('cookie store unavailable'))
    await expect(GET()).rejects.toThrow('cookie store unavailable')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
