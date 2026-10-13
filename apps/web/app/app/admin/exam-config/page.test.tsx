import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./_components/exam-config-content', () => ({
  ExamConfigContent: () => {
    throw new Promise(() => {})
  },
}))

import ExamConfigPage from './page'

describe('ExamConfigPage', () => {
  it('renders the page title as a level-1 heading', () => {
    render(<ExamConfigPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Exam Configuration' })).toHaveClass(
      'text-title',
      'font-semibold',
    )
  })

  it('shows skeleton rows while the configuration loads', () => {
    const { container } = render(<ExamConfigPage />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(9)
    expect(container.querySelector('.animate-pulse:not([data-slot="skeleton"])')).toBeNull()
  })
})
