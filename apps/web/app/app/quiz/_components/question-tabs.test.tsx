import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuestionTabs } from './question-tabs'

describe('QuestionTabs', () => {
  it('renders all four tabs', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Question' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explanation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-pressed', () => {
    render(<QuestionTabs activeTab="comments" onTabChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Comments' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Question' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('explanation tab is always enabled regardless of answer state', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Explanation' })).toBeEnabled()
  })

  it('calls onTabChange when any tab is clicked', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<QuestionTabs activeTab="question" onTabChange={onTabChange} />)

    await user.click(screen.getByRole('button', { name: 'Explanation' }))
    expect(onTabChange).toHaveBeenCalledWith('explanation')
  })

  it('calls onTabChange when switching between non-question tabs', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<QuestionTabs activeTab="explanation" onTabChange={onTabChange} />)

    await user.click(screen.getByRole('button', { name: 'Stats' }))
    expect(onTabChange).toHaveBeenCalledWith('statistics')
  })

  it('places the tabs inside a group', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)
    const tab = screen.getByRole('button', { name: 'Question' })
    expect(tab.closest('[role="group"]')).not.toBeNull()
  })

  it('names the group', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Question view' })).toBeInTheDocument()
  })

  it('styles the pressed tab with the segment look', () => {
    render(<QuestionTabs activeTab="statistics" onTabChange={vi.fn()} />)
    const tab = screen.getByRole('button', { name: 'Stats' })
    expect(tab).toHaveClass('aria-pressed:bg-card', 'aria-pressed:border-primary')
    expect(tab.className).not.toMatch(/hover:bg-/)
  })

  it('keeps label-size text with tight phone padding so four tabs fit a 360px screen', () => {
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)
    for (const tab of screen.getAllByRole('button')) {
      expect(tab).toHaveClass('text-label', 'px-1', 'md:px-3')
      expect(tab).not.toHaveClass('text-caption')
    }
  })

  it('lets arrow keys on a focused tab reach the question navigation shortcuts', async () => {
    const user = userEvent.setup()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    render(<QuestionTabs activeTab="question" onTabChange={vi.fn()} />)

    screen.getByRole('button', { name: 'Question' }).focus()
    await user.keyboard('{ArrowRight}')
    window.removeEventListener('keydown', onWindowKey)

    expect(onWindowKey).toHaveBeenCalledWith(expect.objectContaining({ key: 'ArrowRight' }))
  })
})
