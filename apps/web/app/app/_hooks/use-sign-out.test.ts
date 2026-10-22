import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignOut } from './use-sign-out'

const mockSignOut = vi.fn()
const mockGetSession = vi.fn()
const mockCreateClient = vi.fn()
const mockToastError = vi.fn()
const mockAssign = vi.fn()
const originalLocation = window.location

vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }))
vi.mock('@repo/db/client', () => ({
  createClient: () => {
    mockCreateClient()
    return { auth: { signOut: mockSignOut, getSession: mockGetSession } }
  },
}))

describe('useSignOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({})
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
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

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('shows a toast, stays on the page and allows a retry after a returned error while a session remains', async () => {
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

  it('navigates to the login page without a toast when sign-out returns an error but the local session is gone', async () => {
    const error = { message: 'server 5xx' }
    mockSignOut.mockResolvedValueOnce({ error })
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    const { result } = renderHook(() => useSignOut())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockAssign).toHaveBeenCalledWith('/')
    expect(mockToastError).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[useSignOut] sign-out error, local session cleared:',
      error,
    )
  })

  it('shows a toast, stays on the page and allows a retry when the session check fails after a returned error', async () => {
    mockSignOut.mockResolvedValueOnce({ error: { message: 'x' } })
    mockGetSession.mockRejectedValueOnce(new Error('storage unavailable'))
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

    expect(mockAssign).toHaveBeenCalledWith('/')
  })

  it('checks the session on the same client that signed out', async () => {
    mockSignOut.mockResolvedValueOnce({ error: { message: 'x' } })
    const { result } = renderHook(() => useSignOut())

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockCreateClient).toHaveBeenCalledOnce()
  })

  it('shows the failure toast and allows a retry when the auth client fails to load', async () => {
    vi.resetModules()
    vi.doMock('@repo/db/client', () => {
      throw new Error('chunk failed')
    })
    try {
      const { useSignOut: useFreshSignOut } = await import('./use-sign-out')
      const { result } = renderHook(() => useFreshSignOut())

      await act(async () => {
        await result.current.signOut()
      })

      expect(mockToastError).toHaveBeenCalledWith('Sign-out failed. Please try again.')
      expect(mockAssign).not.toHaveBeenCalled()
      expect(result.current.pending).toBe(false)
    } finally {
      vi.doMock('@repo/db/client', () => ({
        createClient: () => {
          mockCreateClient()
          return { auth: { signOut: mockSignOut, getSession: mockGetSession } }
        },
      }))
      vi.resetModules()
    }
  })
})
