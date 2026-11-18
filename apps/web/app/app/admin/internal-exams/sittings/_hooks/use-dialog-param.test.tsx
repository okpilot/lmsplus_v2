import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPush = vi.hoisted(() => vi.fn())
const mockReplace = vi.hoisted(() => vi.fn())
const mockBack = vi.hoisted(() => vi.fn())
const mockSearch = vi.hoisted(() => ({ value: 'tab=sittings&scope=open' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams(mockSearch.value),
}))

import { useDialogParam } from './use-dialog-param'

beforeEach(() => {
  vi.resetAllMocks()
  mockSearch.value = 'tab=sittings&scope=open'
})

describe('useDialogParam', () => {
  it('opens by pushing dlg onto the current URL', () => {
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.open('new'))
    const url = mockPush.mock.calls[0]?.[0] as string
    expect(url).toContain('dlg=new')
    expect(url).toContain('scope=open')
  })

  it('closes with history back when the dialog was opened in this session', () => {
    const { result, rerender } = renderHook(() => useDialogParam())
    act(() => result.current.open('new'))
    mockSearch.value = 'tab=sittings&scope=open&dlg=new'
    rerender()
    act(() => result.current.close())
    expect(mockBack).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('closes by replacing the URL without dlg when deep-linked', () => {
    mockSearch.value = 'tab=sittings&scope=open&dlg=edit'
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.close())
    expect(mockBack).not.toHaveBeenCalled()
    const url = mockReplace.mock.calls[0]?.[0] as string
    expect(url).not.toContain('dlg=')
    expect(url).toContain('scope=open')
  })
})
