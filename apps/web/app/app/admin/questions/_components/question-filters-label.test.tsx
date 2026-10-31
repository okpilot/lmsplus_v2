import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./question-filter-selects', () => ({
  QuestionFilterSelects: () => <div />,
}))

import { QuestionFiltersBar } from './question-filters'

describe('QuestionFiltersBar search name (#1433 S7)', () => {
  it('AC3: search input has aria-label "Search questions"', () => {
    render(<QuestionFiltersBar tree={[]} filters={{}} />)
    expect(screen.getByRole('searchbox', { name: 'Search questions' })).toBeInTheDocument()
  })

  it('AC3/AC5: search input keeps the "Search question text..." placeholder', () => {
    render(<QuestionFiltersBar tree={[]} filters={{}} />)
    expect(screen.getByPlaceholderText('Search question text...')).toBeInTheDocument()
  })
})
