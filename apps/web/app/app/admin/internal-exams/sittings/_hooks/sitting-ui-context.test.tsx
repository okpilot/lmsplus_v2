import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  search: { value: '' },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: m.back }),
  usePathname: () => '/app/admin/internal-exams/sittings',
  useSearchParams: () => new URLSearchParams(m.search.value),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { SittingUiProvider, useSittingUi } from './sitting-ui-context'

beforeEach(() => {
  vi.resetAllMocks()
  m.search.value = ''
})

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

describe('shared close guard', () => {
  it('lets two consumers close once, and re-arms after dlg leaves the URL', () => {
    m.search.value = 'dlg=new'
    const { result, rerender } = renderHook(() => [useSittingUi(), useSittingUi()] as const, {
      wrapper,
    })
    act(() => result.current[0].open('new'))
    act(() => {
      result.current[0].close()
      result.current[1].close()
    })
    expect(m.back).toHaveBeenCalledTimes(1)
    m.search.value = ''
    rerender()
    act(() => result.current[0].open('new'))
    m.search.value = 'dlg=new'
    rerender()
    act(() => result.current[1].close())
    expect(m.back).toHaveBeenCalledTimes(2)
  })
})

describe('openedHere reset', () => {
  it('clears openedHere when dlg leaves the URL, so a later close replaces', () => {
    const { result, rerender } = renderHook(() => useSittingUi(), { wrapper })
    act(() => result.current.open('new'))
    m.search.value = 'dlg=new'
    rerender()
    m.search.value = ''
    rerender()
    m.search.value = 'dlg=new'
    rerender()
    act(() => result.current.close())
    expect(m.back).not.toHaveBeenCalled()
    expect(m.replace).toHaveBeenCalledTimes(1)
    expect(m.replace).toHaveBeenCalledWith('/app/admin/internal-exams/sittings')
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

describe('provider with a repeated dlg', () => {
  it('re-arms the close guard when dlg becomes a repeated value the server ignores', () => {
    m.search.value = 'dlg=new'
    const { result, rerender } = renderHook(() => useSittingUi(), { wrapper })
    act(() => result.current.open('new'))
    m.search.value = 'dlg=new&dlg=new'
    rerender()
    act(() => result.current.close())
    expect(m.back).not.toHaveBeenCalled()
    expect(m.replace).toHaveBeenCalledTimes(1)
  })
})
