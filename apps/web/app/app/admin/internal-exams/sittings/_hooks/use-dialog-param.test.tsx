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

import { type DialogRefs, dialogHref, useDialogParam } from './use-dialog-param'

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

  it('records a given opener instead of the focused element', () => {
    const trigger = document.createElement('button')
    const other = document.createElement('button')
    document.body.append(trigger, other)
    other.focus()
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.open('edit', trigger))
    expect(result.current.openerRef.current).toBe(trigger)
    trigger.remove()
    other.remove()
  })

  it('closes with history back when the dialog was opened in this session', () => {
    const { result, rerender } = renderHook(() => useDialogParam())
    act(() => result.current.open('new'))
    mockSearch.value = 'tab=sittings&scope=open&dlg=new'
    rerender()
    act(() => result.current.close())
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('closes by replacing the URL without dlg when deep-linked', () => {
    mockSearch.value = 'tab=sittings&scope=open&dlg=edit'
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.close())
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/internal-exams?tab=sittings&scope=open')
  })

  it('collapses two close() calls into one router.back()', () => {
    const refs: DialogRefs = {
      openedHere: { current: true },
      openerRef: { current: null },
      closing: { current: false },
    }
    mockSearch.value = 'tab=sittings&dlg=new'
    const a = renderHook(() => useDialogParam(refs))
    const b = renderHook(() => useDialogParam(refs))
    act(() => {
      a.result.current.close()
      b.result.current.close()
    })
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('collapses two close() calls on a deep link into one replace', () => {
    mockSearch.value = 'tab=sittings&dlg=edit'
    const { result } = renderHook(() => useDialogParam())
    act(() => {
      result.current.close()
      result.current.close()
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/internal-exams?tab=sittings')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('closes again after the dialog was closed and reopened', () => {
    mockSearch.value = 'tab=sittings&dlg=edit'
    const { result, rerender } = renderHook(() => useDialogParam())
    act(() => result.current.close())
    mockSearch.value = 'tab=sittings'
    rerender()
    act(() => result.current.open('new'))
    mockSearch.value = 'tab=sittings&dlg=new'
    rerender()
    act(() => result.current.close())
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/internal-exams?tab=sittings')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('consumeOpenedHere reports a session open once, then false', () => {
    const { result } = renderHook(() => useDialogParam())
    expect(result.current.consumeOpenedHere()).toBe(false)
    act(() => result.current.open('new'))
    expect(result.current.consumeOpenedHere()).toBe(true)
    expect(result.current.consumeOpenedHere()).toBe(false)
  })
})

describe('dialogHref', () => {
  it('adds the dialog while keeping the other params', () => {
    expect(dialogHref('/p', 'tab=sittings&scope=open', 'new')).toBe(
      '/p?tab=sittings&scope=open&dlg=new',
    )
  })

  it('replaces an existing dialog', () => {
    expect(dialogHref('/p', 'dlg=new&tab=sittings', 'edit')).toBe('/p?dlg=edit&tab=sittings')
  })

  it('removes the dialog and keeps the rest', () => {
    expect(dialogHref('/p', 'tab=sittings&dlg=new', null)).toBe('/p?tab=sittings')
  })

  it('returns the bare pathname when nothing is left', () => {
    expect(dialogHref('/p', 'dlg=edit', null)).toBe('/p')
  })
})

describe('useDialogParam with a repeated dlg', () => {
  it('reports no open dialog for ?dlg=new&dlg=new, as the server does', () => {
    mockSearch.value = 'tab=sittings&dlg=new&dlg=new'
    const { result } = renderHook(() => useDialogParam())
    expect(result.current.dlg).toBeNull()
  })
})
