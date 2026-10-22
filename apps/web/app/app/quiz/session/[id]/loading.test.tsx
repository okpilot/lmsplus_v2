import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QuizSessionLoading from './loading'

describe('QuizSessionLoading', () => {
  it('shows the visible loading text', () => {
    render(<QuizSessionLoading />)

    const label = screen.getByText('Loading questions…')
    expect(label).not.toHaveClass('sr-only')
    expect(label.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('marks the main region busy', () => {
    render(<QuizSessionLoading />)

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows Previous and Next labels hidden from assistive tech, without any buttons', () => {
    const { container } = render(<QuizSessionLoading />)

    expect(screen.getByText('‹ Previous')).toBeInTheDocument()
    expect(screen.getByText('Next ›')).toBeInTheDocument()
    expect(screen.getByText('‹ Previous').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('Next ›').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
