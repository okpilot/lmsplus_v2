import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignOut } from './use-sign-out'

const mockSignOut = vi.fn()
const mockToastError = vi.fn()
const mockAssign = vi.fn()
const originalLocation = window.location

vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }))
vi.mock('@repo/db/client', () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}))

describe('useSignOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: mockAssign },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('loads the login page as a full document navigation after signing out', async () => {
    const { result } = renderHook(() => useSignOut())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockAssign).toHaveBeenCalledWith('/')
  })

  it('reports pending while sign-out is in flight', async () => {
    mockSignOut.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useSignOut())
    expect(result.current.pending).toBe(false)

    await act(async () => {
      void result.current.signOut()
    })

    expect(result.current.pending).toBe(true)
  })

  it('signs out once when called twice before any re-render', async () => {
    mockSignOut.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useSignOut())

    await act(async () => {
      void result.current.signOut()
      void result.current.signOut()
    })

    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('shows a toast, stays on the page and allows a retry after a returned error', async () => {
    mockSignOut.mockResolvedValueOnce({ error: { message: 'x' } })
    const { result } = renderHook(() => useSignOut())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockToastError).toHaveBeenCalledWith('Sign-out failed. Please try again.')
    expect(mockAssign).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockSignOut).toHaveBeenCalledTimes(2)
    expect(mockAssign).toHaveBeenCalledWith('/')
  })

  it('shows a toast, stays on the page and allows a retry after a thrown error', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useSignOut())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockToastError).toHaveBeenCalledWith('Sign-out failed. Please try again.')
    expect(mockAssign).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockAssign).toHaveBeenCalledWith('/')
  })
})
