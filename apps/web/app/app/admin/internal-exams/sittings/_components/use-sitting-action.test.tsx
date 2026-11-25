import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ refresh: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: m.refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { useSittingAction } from './use-sitting-action'

beforeEach(() => vi.resetAllMocks())

describe('useSittingAction', () => {
  it('reports the banner built by onOk on success and does not refresh (the action revalidates)', async () => {
    const { result } = renderHook(() => useSittingAction())
    const onOk = vi.fn().mockReturnValue({ tone: 'success', title: 'Done.' })
    act(() => result.current.run(async () => ({ success: true as const, n: 1 }), onOk))
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalledWith('Done.', undefined))
    expect(onOk).toHaveBeenCalledWith({ success: true, n: 1 })
    expect(m.refresh).not.toHaveBeenCalled()
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

  it('reports a failure as a danger banner when errorAsBanner is set, leaving error empty', async () => {
    const { result } = renderHook(() => useSittingAction())
    act(() =>
      result.current.run(async () => ({ success: false as const, error: 'Nope' }), vi.fn(), {
        errorAsBanner: true,
      }),
    )
    await waitFor(() => expect(m.toastError).toHaveBeenCalledWith('Nope'))
    expect(result.current.error).toBeNull()
  })
})

describe('useSittingAction lock (D-b5, AC 47)', () => {
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <SittingUiProvider>{children}</SittingUiProvider>
  )
  const both = () => renderHook(() => ({ a: useSittingAction(), ui: useSittingUi() }), { wrapper })

  it('locks the popup for the duration of the call and releases it on success', async () => {
    const { result } = both()
    let finish: (v: { success: true }) => void = () => undefined
    act(() =>
      result.current.a.run(
        () =>
          new Promise<{ success: true }>((res) => {
            finish = res
          }),
        () => null,
        { lock: true },
      ),
    )
    expect(result.current.ui.locked).toBe(true)
    await act(async () => finish({ success: true }))
    expect(result.current.ui.locked).toBe(false)
  })

  it('releases the lock after a failure and after a throw', async () => {
    const { result } = both()
    act(() =>
      result.current.a.run(async () => ({ success: false as const, error: 'Nope' }), vi.fn(), {
        lock: true,
      }),
    )
    await waitFor(() => expect(result.current.a.error).toBe('Nope'))
    expect(result.current.ui.locked).toBe(false)
    act(() =>
      result.current.a.run(
        async () => {
          throw new Error('x')
        },
        vi.fn(),
        { lock: true },
      ),
    )
    await waitFor(() => expect(result.current.a.error).toBe('Service error. Please try again.'))
    expect(result.current.ui.locked).toBe(false)
  })

  it('does not lock without the option', async () => {
    const { result } = both()
    let finish: (v: { success: true }) => void = () => undefined
    act(() =>
      result.current.a.run(
        () =>
          new Promise<{ success: true }>((res) => {
            finish = res
          }),
        () => null,
      ),
    )
    expect(result.current.ui.locked).toBe(false)
    await act(async () => finish({ success: true }))
  })
})
