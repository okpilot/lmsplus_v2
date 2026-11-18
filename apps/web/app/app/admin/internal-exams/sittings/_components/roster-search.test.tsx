import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/app/app/_components/filter-select', () => ({
  FilterSelect: (p: {
    value: string
    ariaLabel: string
    items: { value: string; label: string }[]
    onValueChange: (v: string | null) => void
  }) => (
    <select
      aria-label={p.ariaLabel}
      value={p.value}
      onChange={(e) => p.onValueChange(e.target.value)}
    >
      {p.items.map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  ),
}))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { RosterSearch } from './roster-search'
import { ShowFilter } from './show-filter'

const LABEL = 'Search people in this sitting'

beforeEach(() => {
  vi.useFakeTimers()
  mockReplace.mockReset()
  window.history.replaceState(null, '', '/x?page=4&show=needs_code')
})
afterEach(() => vi.useRealTimers())

describe('RosterSearch', () => {
  it('limits the input to 100 characters', () => {
    render(<RosterSearch value="" />)
    expect(screen.getByLabelText('Search people in this sitting')).toHaveAttribute(
      'maxlength',
      '100',
    )
  })

  it('writes q after a 300 ms debounce and clears page', () => {
    render(<RosterSearch value="" />)
    fireEvent.change(screen.getByLabelText('Search people in this sitting'), {
      target: { value: 'ann' },
    })
    vi.advanceTimersByTime(299)
    expect(mockReplace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    const url = mockReplace.mock.calls[0]?.[0] as string
    expect(url).toContain('q=ann')
    expect(url).toContain('show=needs_code')
    expect(url).not.toContain('page=')
  })

  it('debounces: only the last of quick edits reaches the URL', () => {
    render(<RosterSearch value="" />)
    const box = screen.getByLabelText('Search people in this sitting')
    fireEvent.change(box, { target: { value: 'a' } })
    vi.advanceTimersByTime(100)
    fireEvent.change(box, { target: { value: 'an' } })
    vi.advanceTimersByTime(400)
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace.mock.calls[0]?.[0] as string).toContain('q=an')
  })

  it('idle value change (Back/Forward) re-syncs the box and never re-pushes', () => {
    const { rerender } = render(<RosterSearch value="smith" />)
    rerender(<RosterSearch value="" />)
    expect(screen.getByLabelText(LABEL)).toHaveValue('')
    vi.advanceTimersByTime(1000)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('keeps a trailing space after its own search lands in the URL', () => {
    const { rerender } = render(<RosterSearch value="" />)
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: 'john ' } })
    vi.advanceTimersByTime(300)
    rerender(<RosterSearch value="john" />)
    expect(screen.getByLabelText(LABEL)).toHaveValue('john ')
  })

  it('value change while typing is pending keeps the typed text', () => {
    const { rerender } = render(<RosterSearch value="smith" />)
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: 'jon' } })
    rerender(<RosterSearch value="" />)
    expect(screen.getByLabelText(LABEL)).toHaveValue('jon')
    vi.advanceTimersByTime(300)
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace.mock.calls[0]?.[0] as string).toContain('q=jon')
  })

  it('Show change before the debounce fires writes one URL with show and q', () => {
    render(
      <SittingUiProvider>
        <RosterSearch value="" />
        <ShowFilter value="all" />
      </SittingUiProvider>,
    )
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: 'ann' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'needs_code' },
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = mockReplace.mock.calls[0]?.[0] as string
    expect(url).toContain('show=needs_code')
    expect(url).toContain('q=ann')
  })

  it('unmount clears the pending timer', () => {
    const { unmount } = render(<RosterSearch value="" />)
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: 'ann' } })
    unmount()
    vi.advanceTimersByTime(1000)
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
