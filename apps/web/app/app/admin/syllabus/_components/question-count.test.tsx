import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuestionCount } from './question-count'

describe('QuestionCount', () => {
  it('pluralises', () => {
    render(<QuestionCount count={5} />)
    expect(screen.getByText('5 questions')).toHaveClass('text-muted-foreground', 'tabular-nums')
  })

  it('uses the singular for 1', () => {
    render(<QuestionCount count={1} />)
    expect(screen.getByText('1 question')).toBeInTheDocument()
  })

  it('pluralises 0', () => {
    render(<QuestionCount count={0} />)
    expect(screen.getByText('0 questions')).toBeInTheDocument()
  })
})
