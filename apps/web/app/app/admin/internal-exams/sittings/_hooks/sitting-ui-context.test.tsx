import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { SittingUiProvider, useSittingUi } from './sitting-ui-context'

beforeEach(() => vi.resetAllMocks())

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <SittingUiProvider>{children}</SittingUiProvider>
}

describe('useSittingUi with a provider', () => {
  it('keeps a caution banner in shared state and shows no toast', () => {
    const { result } = renderHook(() => useSittingUi(), { wrapper })
    act(() => result.current.setBanner({ tone: 'caution', title: 'Careful' }))
    expect(result.current.banner).toEqual({ tone: 'caution', title: 'Careful' })
    expect(m.toastSuccess).not.toHaveBeenCalled()
  })

  it('turns a success banner into a toast with detail and clears the banner', () => {
    const { result } = renderHook(() => useSittingUi(), { wrapper })
    act(() => result.current.setBanner({ tone: 'danger', title: 'Old' }))
    act(() => result.current.setBanner({ tone: 'success', title: 'Done', detail: 'Extra' }))
    expect(result.current.banner).toBeNull()
    expect(m.toastSuccess).toHaveBeenCalledWith('Done', { description: 'Extra' })
  })

  it('toasts a success banner without detail with no options', () => {
    const { result } = renderHook(() => useSittingUi(), { wrapper })
    act(() => result.current.setBanner({ tone: 'success', title: 'Done' }))
    expect(m.toastSuccess).toHaveBeenCalledWith('Done', undefined)
  })

  it('shares the lock flag', () => {
    const { result } = renderHook(() => useSittingUi(), { wrapper })
    expect(result.current.locked).toBe(false)
    act(() => result.current.setLocked(true))
    expect(result.current.locked).toBe(true)
  })
})

describe('useSittingUi without a provider', () => {
  it('toasts an error banner and holds no banner state', () => {
    const { result } = renderHook(() => useSittingUi())
    act(() => result.current.setBanner({ tone: 'danger', title: 'Broke' }))
    expect(m.toastError).toHaveBeenCalledWith('Broke')
    expect(result.current.banner).toBeNull()
    expect(result.current.locked).toBe(false)
  })

  it('toasts a success banner as success', () => {
    const { result } = renderHook(() => useSittingUi())
    act(() => result.current.setBanner({ tone: 'success', title: 'Ok' }))
    expect(m.toastSuccess).toHaveBeenCalledWith('Ok', undefined)
    expect(m.toastError).not.toHaveBeenCalled()
  })

  it('ignores a null banner', () => {
    const { result } = renderHook(() => useSittingUi())
    act(() => result.current.setBanner(null))
    expect(m.toastError).not.toHaveBeenCalled()
    expect(m.toastSuccess).not.toHaveBeenCalled()
  })
})
