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

  it('renders placeholder skeletons without buttons or a fixed control bar', () => {
    const { container } = render(<QuizSessionLoading />)

    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelector('.fixed')).toBeNull()
  })
})
