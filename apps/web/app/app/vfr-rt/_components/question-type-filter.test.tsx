import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuestionTypeFilter } from './question-type-filter'

describe('QuestionTypeFilter — rendering', () => {
  it('renders All types plus every question type option', () => {
    render(<QuestionTypeFilter value={undefined} onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'All types' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Multiple Choice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Short Answer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill in the Blank' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ordering' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Diagram' })).toBeInTheDocument()
  })
})

describe('QuestionTypeFilter — selection', () => {
  it('calls onValueChange with the selected type when a type option is clicked', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<QuestionTypeFilter value={undefined} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'Ordering' }))
    expect(onValueChange).toHaveBeenCalledWith('ordering')
  })

  it('calls onValueChange with undefined when All types is clicked', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<QuestionTypeFilter value="ordering" onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'All types' }))
    expect(onValueChange).toHaveBeenCalledWith(undefined)
  })
})

describe('QuestionTypeFilter — active state', () => {
  it('marks All types as pressed when value is undefined', () => {
    render(<QuestionTypeFilter value={undefined} onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'All types' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Ordering' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('marks the selected type as pressed and All types as not pressed', () => {
    render(<QuestionTypeFilter value="diagram_label" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Diagram' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All types' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
