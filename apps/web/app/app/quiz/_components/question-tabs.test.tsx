import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuestionTabs } from './question-tabs'

describe('QuestionTabs', () => {
  it('renders all four tabs', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Question' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Explanation' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Statistics' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    render(<QuestionTabs activeTab="comments" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Question' })).toHaveAttribute('aria-selected', 'false')
  })

  it('explanation tab is always enabled regardless of answer state', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Explanation' })).toBeEnabled()
  })

  it('calls onTabChange when any tab is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<QuestionTabs activeTab="question" onTabChange={onTabChange} />)

    await user.click(screen.getByRole('tab', { name: 'Explanation' }))
    expect(onTabChange).toHaveBeenCalledWith('explanation')
  })

  it('calls onTabChange when switching between non-question tabs', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<QuestionTabs activeTab="explanation" onTabChange={onTabChange} />)

    await user.click(screen.getByRole('tab', { name: 'Statistics' }))
    expect(onTabChange).toHaveBeenCalledWith('statistics')
  })
})
