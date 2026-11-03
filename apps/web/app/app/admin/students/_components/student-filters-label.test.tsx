import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { StudentFiltersBar } from './student-filters'

describe('StudentFiltersBar search name (#1433 S7)', () => {
  it('AC3: search input has aria-label "Search students"', () => {
    render(<StudentFiltersBar filters={{}} />)
    expect(screen.getByRole('searchbox', { name: 'Search students' })).toBeInTheDocument()
  })

  it('AC3/AC5: search input keeps the "Search students..." placeholder', () => {
    render(<StudentFiltersBar filters={{}} />)
    expect(screen.getByPlaceholderText('Search students...')).toBeInTheDocument()
  })
})
