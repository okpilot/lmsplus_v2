import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./_components/students-content', () => ({
  StudentsContent: () => {
    throw new Promise(() => {})
  },
}))

import StudentsPage from './page'

describe('StudentsPage', () => {
  it('renders the page title as a level-1 heading', async () => {
    render(await StudentsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Student Management' })).toHaveClass(
      'text-title',
      'font-semibold',
    )
  })

  it('shows a skeleton while the students load', async () => {
    const { container } = render(await StudentsPage({ searchParams: Promise.resolve({}) }))
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    expect(container.querySelector('.animate-pulse:not([data-slot="skeleton"])')).toBeNull()
  })
})
