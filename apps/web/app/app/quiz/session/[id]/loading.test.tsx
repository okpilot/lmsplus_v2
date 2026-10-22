import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QuizSessionLoading from './loading'

describe('QuizSessionLoading', () => {
  it('shows the visible loading text, announced as a status', () => {
    render(<QuizSessionLoading />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading quiz…')
  })

  it('marks the frame busy', () => {
    const { container } = render(<QuizSessionLoading />)

    expect(container.querySelector('[data-session-frame]')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows Previous and Next labels without any buttons', () => {
    render(<QuizSessionLoading />)

    expect(screen.getByText('‹ Previous')).toBeInTheDocument()
    expect(screen.getByText('Next ›')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders no answer options', () => {
    const { container } = render(<QuizSessionLoading />)

    expect(container.querySelector('[data-testid^="option-"]')).toBeNull()
  })
})
