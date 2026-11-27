import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/app/admin/internal-exams',
}))

// Native select stand-in (Base UI portals do not work in jsdom); order: subject, sitting, group.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    children: React.ReactNode
  }) => (
    <select data-testid="select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => <span />,
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { AttemptsFilters } from './attempts-filters'

const options = {
  subjects: [{ id: 'sub-1', name: 'Air Law' }],
  sittings: [{ id: 'sit-1', label: '01/05/2026, 09:00 remote' }],
  groups: [{ id: 'grp-1', name: 'Cohort A' }],
}
const URL_BASE = '/app/admin/internal-exams'

function renderBar(filters: Record<string, string | undefined> = {}) {
  return render(<AttemptsFilters filters={filters as never} options={options as never} />)
}

beforeEach(() => {
  vi.useFakeTimers()
  mockReplace.mockReset()
  window.history.replaceState(null, '', `${URL_BASE}?tab=attempts&attemptsPage=3`)
})
afterEach(() => vi.useRealTimers())

describe('AttemptsFilters', () => {
  it('renders three selects, a search input and Clear', () => {
    renderBar()
    expect(screen.getAllByTestId('select')).toHaveLength(3)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('debounces typing into q and resets attemptsPage', () => {
    renderBar()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' ann ' } })
    expect(mockReplace).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = new URL(mockReplace.mock.calls[0]?.[0], 'http://x')
    expect(url.searchParams.get('q')).toBe('ann')
    expect(url.searchParams.has('attemptsPage')).toBe(false)
    expect(url.searchParams.get('tab')).toBe('attempts')
  })

  it.each([
    [0, 'subject', 'sub-1'],
    [1, 'sitting', 'sit-1'],
    [2, 'group', 'grp-1'],
  ])('select %i writes ?%s and clears attemptsPage', (idx, key, value) => {
    renderBar()
    fireEvent.change(screen.getAllByTestId('select')[idx] as HTMLElement, { target: { value } })
    const url = new URL(mockReplace.mock.calls[0]?.[0], 'http://x')
    expect(url.searchParams.get(key)).toBe(value)
    expect(url.searchParams.has('attemptsPage')).toBe(false)
  })

  it('flushes pending typing into the URL when a select changes', () => {
    renderBar()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ann' } })
    fireEvent.change(screen.getAllByTestId('select')[1] as HTMLElement, {
      target: { value: 'sit-1' },
    })
    const url = new URL(mockReplace.mock.calls[0]?.[0], 'http://x')
    expect(url.searchParams.get('q')).toBe('ann')
    expect(url.searchParams.get('sitting')).toBe('sit-1')
  })

  it('Clear removes q, subject, sitting, group and attemptsPage but keeps the tab', () => {
    window.history.replaceState(
      null,
      '',
      `${URL_BASE}?tab=attempts&q=a&subject=sub-1&sitting=sit-1&group=grp-1&attemptsPage=3`,
    )
    renderBar({ q: 'a', subject: 'sub-1', sitting: 'sit-1', group: 'grp-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(mockReplace).toHaveBeenCalledWith(`${URL_BASE}?tab=attempts`)
  })

  it('removes the param and resets attemptsPage when a select returns to All', () => {
    window.history.replaceState(null, '', `${URL_BASE}?tab=attempts&subject=sub-1&attemptsPage=3`)
    renderBar({ subject: 'sub-1' })
    fireEvent.change(screen.getAllByTestId('select')[0] as HTMLElement, {
      target: { value: '__all__' },
    })
    expect(mockReplace).toHaveBeenCalledWith(`${URL_BASE}?tab=attempts`)
  })

  it('keeps a URL-selected id missing from the option list selectable', () => {
    renderBar({ group: 'grp-missing' })
    const select = screen.getAllByTestId('select')[2] as HTMLSelectElement
    expect(select.value).toBe('grp-missing')
    expect(screen.getByRole('option', { name: 'Selected group' })).toBeTruthy()
  })
})
