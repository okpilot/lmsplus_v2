import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuestionTabs } from './question-tabs'

describe('QuestionTabs', () => {
  it('renders all four tabs', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} hasAnswered={false} />)
    expect(screen.getByRole('tab', { name: 'Question' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Explanation' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Statistics' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    render(<QuestionTabs activeTab="comments" onTabChange={vi.fn()} hasAnswered={false} />)
    expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Question' })).toHaveAttribute('aria-selected', 'false')
  })

  it('disables the explanation tab when hasAnswered is false', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} hasAnswered={false} />)
    expect(screen.getByRole('tab', { name: 'Explanation' })).toBeDisabled()
  })

  it('enables the explanation tab when hasAnswered is true', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} hasAnswered={true} />)
    expect(screen.getByRole('tab', { name: 'Explanation' })).toBeEnabled()
  })

  it('calls onTabChange when a tab is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<QuestionTabs activeTab="question" onTabChange={onTabChange} hasAnswered={true} />)

    await user.click(screen.getByRole('tab', { name: 'Explanation' }))
    expect(onTabChange).toHaveBeenCalledWith('explanation')
  })

  it('does not call onTabChange when clicking a disabled tab', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<QuestionTabs activeTab="question" onTabChange={onTabChange} hasAnswered={false} />)

    await user.click(screen.getByRole('tab', { name: 'Explanation' }))
    expect(onTabChange).not.toHaveBeenCalled()
  })
})
