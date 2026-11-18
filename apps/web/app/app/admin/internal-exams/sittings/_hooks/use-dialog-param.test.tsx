import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPush = vi.hoisted(() => vi.fn())
const mockReplace = vi.hoisted(() => vi.fn())
const mockBack = vi.hoisted(() => vi.fn())
const mockSearch = vi.hoisted(() => ({ value: 'tab=sittings&scope=open' }))
const history = vi.hoisted(() => ({ stack: [] as string[] }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams(mockSearch.value),
}))

import { type DialogRefs, paramsHref, useDialogParam } from './use-dialog-param'

beforeEach(() => {
  vi.resetAllMocks()
  seedHistory(['tab=sittings&scope=open'])
  mockPush.mockImplementation((url: string) => history.stack.push(url))
  mockReplace.mockImplementation((url: string) => history.stack.splice(-1, 1, url))
  mockBack.mockImplementation(() => history.stack.pop())
})

/** Seeds the browser history with these searches; the last is the current URL and what `useSearchParams` reads. */
function seedHistory(searches: string[]) {
  history.stack = searches.map((q) => `/app/admin/internal-exams?${q}`)
  mockSearch.value = searches.at(-1) ?? ''
}

const currentUrl = () => history.stack.at(-1)

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
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith(
      '/app/admin/internal-exams?tab=sittings&scope=open&dlg=new',
    )
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
    expect(currentUrl()).toBe('/app/admin/internal-exams?tab=sittings&scope=open')
  })

  it('closes by replacing the URL without dlg when deep-linked', () => {
    seedHistory(['tab=sittings&scope=open&dlg=edit'])
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.close())
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/internal-exams?tab=sittings&scope=open')
  })

  it('ignores param edits once the dialog is closing, and accepts them after it reopens', () => {
    const { result, rerender } = renderHook(() => useDialogParam())
    act(() => result.current.open('people'))
    mockSearch.value = 'tab=sittings&scope=open&dlg=people'
    rerender()
    act(() => result.current.close())
    act(() => result.current.replaceParams({ pq: 'ann' }))
    expect(mockReplace).not.toHaveBeenCalled()
    act(() => result.current.open('people'))
    act(() => result.current.replaceParams({ pq: 'ann' }))
    expect(mockReplace.mock.calls[0]?.[0] as string).toContain('pq=ann')
  })

  it('closing drops every popup param and keeps the rest', () => {
    mockSearch.value = 'tab=sittings&dlg=exams&ids=u1&all=1&pq=x&ppage=2'
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.close())
    expect(mockReplace.mock.calls[0]?.[0]).toBe('/app/admin/internal-exams?tab=sittings')
  })

  it('collapses two close() calls into one router.back()', () => {
    const refs: DialogRefs = {
      openedHere: { current: true },
      openerRef: { current: null },
      closing: { current: false },
    }
    seedHistory(['tab=sittings', 'tab=sittings&dlg=new'])
    const a = renderHook(() => useDialogParam(refs))
    const b = renderHook(() => useDialogParam(refs))
    act(() => {
      a.result.current.close()
      b.result.current.close()
    })
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
    expect(history.stack).toEqual(['/app/admin/internal-exams?tab=sittings'])
  })

  it('collapses two close() calls on a deep link into one replace', () => {
    seedHistory(['tab=sittings&dlg=edit'])
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
    seedHistory(['tab=sittings&dlg=edit'])
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
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/app/admin/internal-exams?tab=sittings&dlg=new')
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(currentUrl()).toBe('/app/admin/internal-exams?tab=sittings')
  })

  it('consumeOpenedHere reports a session open once, then false', () => {
    const { result } = renderHook(() => useDialogParam())
    expect(result.current.consumeOpenedHere()).toBe(false)
    act(() => result.current.open('new'))
    expect(result.current.consumeOpenedHere()).toBe(true)
    expect(result.current.consumeOpenedHere()).toBe(false)
  })
})

describe('useDialogParam popups (AC 46)', () => {
  it('opens with extras and does not scroll', () => {
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.open('exams', null, { ids: 'u1,u2' }))
    const [url, opts] = mockPush.mock.calls[0] ?? []
    expect(url).toContain('dlg=exams')
    expect(url).toContain('ids=u1%2Cu2')
    expect(opts).toEqual({ scroll: false })
  })

  it('strips stale popup params when opening another popup', () => {
    mockSearch.value = 'tab=sittings&dlg=people&pq=ann&pgroup=g1&ppage=2&ids=a&all=1'
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.open('issue'))
    const url = mockPush.mock.calls[0]?.[0] as string
    expect(url).toBe('/app/admin/internal-exams?tab=sittings&dlg=issue')
  })

  it('replaces popup params in place without adding history', () => {
    mockSearch.value = 'tab=sittings&dlg=people'
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.replaceParams({ pq: 'a', ppage: null }))
    act(() => result.current.replaceParams({ pq: 'an' }))
    act(() => result.current.replaceParams({ pq: null }))
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledTimes(3)
    expect(mockReplace.mock.calls[0]).toEqual([
      '/app/admin/internal-exams?tab=sittings&dlg=people&pq=a',
      { scroll: false },
    ])
  })

  it('carries both patches when a second replaceParams runs before the first commits', () => {
    mockSearch.value = 'tab=sittings&dlg=people'
    const { result } = renderHook(() => useDialogParam())
    act(() => {
      result.current.replaceParams({ pq: 'ann' })
      result.current.replaceParams({ pgroup: 'g1' })
    })
    expect(mockReplace.mock.calls[1]?.[0]).toBe(
      '/app/admin/internal-exams?tab=sittings&dlg=people&pq=ann&pgroup=g1',
    )
  })

  it('keeps a patch pending until the committed URL carries it', () => {
    mockSearch.value = 'tab=sittings&dlg=people'
    const { result, rerender } = renderHook(() => useDialogParam())
    act(() => {
      result.current.replaceParams({ pq: 'ann' })
      result.current.replaceParams({ pgroup: 'g1' })
    })
    mockSearch.value = 'tab=sittings&dlg=people&pq=ann'
    rerender()
    act(() => result.current.replaceParams({ pcourse: 'c1' }))
    expect(mockReplace.mock.calls[2]?.[0]).toBe(
      '/app/admin/internal-exams?tab=sittings&dlg=people&pq=ann&pgroup=g1&pcourse=c1',
    )
    mockSearch.value = 'tab=sittings&dlg=people&pq=ann&pgroup=g1&pcourse=c1'
    rerender()
    act(() => result.current.replaceParams({ ppage: '2' }))
    expect(mockReplace.mock.calls[3]?.[0]).toBe(
      '/app/admin/internal-exams?tab=sittings&dlg=people&pq=ann&pgroup=g1&pcourse=c1&ppage=2',
    )
  })

  it('drops pending patches when a popup opens or closes', () => {
    mockSearch.value = 'tab=sittings&dlg=people'
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.replaceParams({ pq: 'ann' }))
    act(() => result.current.close())
    act(() => result.current.open('exams'))
    mockSearch.value = 'tab=sittings&dlg=people'
    act(() => result.current.replaceParams({ pgroup: 'g1' }))
    expect(mockReplace.mock.calls.at(-1)?.[0]).toBe(
      '/app/admin/internal-exams?tab=sittings&dlg=people&pgroup=g1',
    )
  })

  it('closes by replacing without any popup param when deep-linked', () => {
    mockSearch.value = 'tab=sittings&dlg=exams&ids=u1&all=1&pq=x'
    const { result } = renderHook(() => useDialogParam())
    act(() => result.current.close())
    expect(mockReplace.mock.calls[0]?.[0]).toBe('/app/admin/internal-exams?tab=sittings')
  })

  it('closes by replacing, not history back, while a navigation is still pending', () => {
    const navRefs = (pending: boolean): DialogRefs => ({
      openedHere: { current: true },
      openerRef: { current: null },
      closing: { current: false },
      nav: { pending, start: (fn: () => void) => fn() },
    })
    mockSearch.value = 'tab=sittings&dlg=people'
    const busy = renderHook(() => useDialogParam(navRefs(true)))
    act(() => busy.result.current.close())
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace.mock.calls[0]?.[0]).toBe('/app/admin/internal-exams?tab=sittings')
    const idle = renderHook(() => useDialogParam(navRefs(false)))
    act(() => idle.result.current.close())
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('runs navigation in the shared transition and reports its pending state', () => {
    const start = vi.fn((fn: () => void) => fn())
    const refs: DialogRefs = {
      openedHere: { current: false },
      openerRef: { current: null },
      closing: { current: false },
      nav: { pending: true, start },
    }
    const { result } = renderHook(() => useDialogParam(refs))
    expect(result.current.isRefreshing).toBe(true)
    act(() => result.current.open('people'))
    act(() => result.current.replaceParams({ pq: 'x' }))
    expect(start).toHaveBeenCalledTimes(2)
  })
})

describe('paramsHref', () => {
  it('sets, replaces and removes params, keeping the rest', () => {
    expect(paramsHref('/p', 'a=1&b=2', { b: '3', c: '4', a: null })).toBe('/p?b=3&c=4')
  })
  it('returns the bare pathname when nothing is left', () => {
    expect(paramsHref('/p', 'a=1', { a: null })).toBe('/p')
  })
})

describe('useDialogParam with a repeated dlg', () => {
  it('reports no open dialog for ?dlg=new&dlg=new, as the server does', () => {
    mockSearch.value = 'tab=sittings&dlg=new&dlg=new'
    const { result } = renderHook(() => useDialogParam())
    expect(result.current.dlg).toBeNull()
  })
})
