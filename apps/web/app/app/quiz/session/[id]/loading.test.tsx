import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QuizSessionLoading from './loading'

describe('QuizSessionLoading', () => {
  it('shows the visible loading text', () => {
    render(<QuizSessionLoading />)

    expect(screen.getByText('Loading quiz…')).toBeInTheDocument()
  })

  it('marks the main region busy', () => {
    render(<QuizSessionLoading />)

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows Previous and Next labels without any buttons', () => {
    const { container } = render(<QuizSessionLoading />)

    expect(screen.getByText('‹ Previous')).toBeInTheDocument()
    expect(screen.getByText('Next ›')).toBeInTheDocument()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
