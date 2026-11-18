import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())
const mockSearch = vi.hoisted(() => ({ value: 'tab=sittings&scope=upcoming&page=2&dlg=new&x=1' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams(mockSearch.value),
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
vi.mock('./sittings-table', () => ({ SittingsTable: () => <div data-testid="sittings-table" /> }))

import { SittingsTab } from './sittings-tab'

beforeEach(() => mockReplace.mockReset())

describe('SittingsTab', () => {
  it('offers the four scopes in the Status select', () => {
    render(<SittingsTab rows={[]} totalCount={0} scope="upcoming" />)
    const select = screen.getByRole('combobox', { name: 'Status' })
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Upcoming',
      'Open now',
      'Past',
      'Cancelled',
    ])
  })

  it('writes the scope to the URL, dropping page and dlg and keeping other params', () => {
    render(<SittingsTab rows={[]} totalCount={0} scope="upcoming" />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'past' },
    })
    const url = mockReplace.mock.calls[0]?.[0] as string
    expect(url).toContain('scope=past')
    expect(url).toContain('x=1')
    expect(url).not.toContain('page=')
    expect(url).not.toContain('dlg=')
  })

  it.each([
    ['upcoming', 'No upcoming sittings.'],
    ['cancelled', 'No cancelled sittings.'],
    ['past', 'No past sittings.'],
  ])('shows the empty copy for the %s scope', (scope, copy) => {
    render(<SittingsTab rows={[]} totalCount={0} scope={scope as never} />)
    expect(screen.getByText(copy)).toBeInTheDocument()
    expect(screen.queryByTestId('sittings-table')).not.toBeInTheDocument()
  })

  it('summarises the visible rows with a plural count', () => {
    const rows = [{ id: 'a' }, { id: 'b' }] as never
    render(<SittingsTab rows={rows} totalCount={2} scope="upcoming" />)
    expect(screen.getByText('2 sittings')).toBeInTheDocument()
    expect(screen.getByTestId('sittings-table')).toBeInTheDocument()
  })
})
