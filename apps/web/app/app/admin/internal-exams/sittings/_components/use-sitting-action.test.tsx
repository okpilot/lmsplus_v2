import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ refresh: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: m.refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { useSittingAction } from './use-sitting-action'

beforeEach(() => vi.resetAllMocks())

describe('useSittingAction', () => {
  it('refreshes the page and reports the banner built by onOk on success', async () => {
    const { result } = renderHook(() => useSittingAction())
    const onOk = vi.fn().mockReturnValue({ tone: 'success', title: 'Done.' })
    act(() => result.current.run(async () => ({ success: true as const, n: 1 }), onOk))
    await waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(1))
    expect(onOk).toHaveBeenCalledWith({ success: true, n: 1 })
    expect(m.toastSuccess).toHaveBeenCalledWith('Done.', undefined)
    expect(result.current.error).toBeNull()
  })

  it('keeps the failure message as error and does not refresh', async () => {
    const { result } = renderHook(() => useSittingAction())
    const onOk = vi.fn()
    act(() => result.current.run(async () => ({ success: false as const, error: 'Nope' }), onOk))
    await waitFor(() => expect(result.current.error).toBe('Nope'))
    expect(onOk).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
    expect(m.toastError).not.toHaveBeenCalled()
  })

  it('reports a service error when the action throws', async () => {
    const { result } = renderHook(() => useSittingAction())
    act(() =>
      result.current.run(async () => {
        throw new Error('network')
      }, vi.fn()),
    )
    await waitFor(() => expect(result.current.error).toBe('Service error. Please try again.'))
    expect(m.refresh).not.toHaveBeenCalled()
  })

  it('clears a previous error when a new run starts and via clearError', async () => {
    const { result } = renderHook(() => useSittingAction())
    act(() => result.current.run(async () => ({ success: false as const, error: 'Nope' }), vi.fn()))
    await waitFor(() => expect(result.current.error).toBe('Nope'))
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})
