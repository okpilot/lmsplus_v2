import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QuizSessionLoading from './loading'

describe('QuizSessionLoading', () => {
  it('announces that the quiz is loading', () => {
    render(<QuizSessionLoading />)

    expect(screen.getByText('Loading')).toBeInTheDocument()
  })
})
