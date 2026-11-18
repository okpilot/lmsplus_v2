import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=people&ppage=3'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./option-select', () => ({
  OptionSelect: (p: {
    label: string
    value: string
    options: { value: string; label: string }[]
    onChange: (v: string) => void
  }) => (
    <select aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { PeopleFilters } from './people-filters'

const filters = (over: Record<string, unknown> = {}) =>
  render(
    <SittingUiProvider>
      <PeopleFilters
        groups={[{ id: 'g1', name: 'Group A' }]}
        courses={[{ id: 'c1', name: 'PPL' }]}
        q=""
        group=""
        course=""
        status="active"
        {...over}
      />
    </SittingUiProvider>,
  )
const href = (n: number) => {
  const url = String(m.replace.mock.calls[n]?.[0])
  return new URLSearchParams(url.slice(url.indexOf('?') + 1))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('PeopleFilters', () => {
  it('navigates once for a burst of typing, after 300 ms, and resets ppage (AC 31)', () => {
    filters()
    const box = screen.getByLabelText('Search name or email')
    fireEvent.change(box, { target: { value: 'a' } })
    fireEvent.change(box, { target: { value: 'an' } })
    fireEvent.change(box, { target: { value: 'ann' } })
    act(() => vi.advanceTimersByTime(299))
    expect(m.replace).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(2))
    expect(m.replace).toHaveBeenCalledTimes(1)
    expect(href(0).get('pq')).toBe('ann')
    expect(href(0).has('ppage')).toBe(false)
  })

  it('writes Group, Course and Status immediately and resets ppage', () => {
    filters()
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'g1' } })
    expect(href(0).get('pgroup')).toBe('g1')
    expect(href(0).has('ppage')).toBe(false)
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'c1' } })
    expect(href(1).get('pcourse')).toBe('c1')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
    expect(href(2).get('pstatus')).toBe('inactive')
  })

  it('removes a param when All is picked, and Active drops pstatus', () => {
    filters({ group: 'g1', status: 'inactive' })
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'all' } })
    expect(href(0).has('pgroup')).toBe(false)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } })
    expect(href(1).has('pstatus')).toBe(false)
  })

  it('offers Active and Deactivated status labels', () => {
    filters()
    expect(screen.getByRole('option', { name: 'Deactivated' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument()
  })
})
