import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuestionFilters } from './question-filters'

describe('QuestionFilters', () => {
  it('renders all three filter options', () => {
    render(<QuestionFilters value="all" onChange={vi.fn()} />)
    expect(screen.getByLabelText('All questions')).toBeInTheDocument()
    expect(screen.getByLabelText('Unseen only')).toBeInTheDocument()
    expect(screen.getByLabelText('Incorrectly answered')).toBeInTheDocument()
  })

  it('checks the radio matching the current value', () => {
    render(<QuestionFilters value="unseen" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Unseen only')).toBeChecked()
    expect(screen.getByLabelText('All questions')).not.toBeChecked()
    expect(screen.getByLabelText('Incorrectly answered')).not.toBeChecked()
  })

  it('calls onChange when a different filter is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuestionFilters value="all" onChange={onChange} />)

    await user.click(screen.getByLabelText('Incorrectly answered'))
    expect(onChange).toHaveBeenCalledWith('incorrect')
  })

  it('does not call onChange when clicking the already selected filter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuestionFilters value="all" onChange={onChange} />)

    await user.click(screen.getByLabelText('All questions'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders a fieldset with legend', () => {
    render(<QuestionFilters value="all" onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Question filter' })).toBeInTheDocument()
  })
})
