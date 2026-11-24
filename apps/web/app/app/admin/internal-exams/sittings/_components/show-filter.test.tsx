import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams('q=ann&page=3'),
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

import { ShowFilter } from './show-filter'

beforeEach(() => {
  mockReplace.mockReset()
  window.history.replaceState(null, '', '/x?q=ann&page=3')
})

describe('ShowFilter', () => {
  it('offers All people, Needs code and Has attempts only', () => {
    render(<ShowFilter value="all" />)
    const select = screen.getByRole('combobox', { name: 'Show' })
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'All people',
      'Needs code',
      'Has attempts',
    ])
  })

  it('writes show to the URL and clears page, keeping q', () => {
    render(<ShowFilter value="all" />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'attempts' },
    })
    const url = mockReplace.mock.calls[0]?.[0] as string
    expect(url).toContain('show=attempts')
    expect(url).toContain('q=ann')
    expect(url).not.toContain('page=')
  })

  it('removes show from the URL for All people', () => {
    window.history.replaceState(null, '', '/x?q=ann&show=needs_code')
    render(<ShowFilter value="needs_code" />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), { target: { value: 'all' } })
    expect(mockReplace.mock.calls[0]?.[0] as string).not.toContain('show=')
  })
})
