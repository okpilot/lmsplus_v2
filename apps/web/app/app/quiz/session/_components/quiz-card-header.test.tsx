import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuizCardHeader } from './quiz-card-header'

function renderHeader(overrides: Partial<React.ComponentProps<typeof QuizCardHeader>> = {}) {
  const props = {
    currentIndex: 1,
    totalQuestions: 5,
    questionNumber: '050-01-01-002' as string | null,
    canFlag: true,
    isFlagged: false,
    flagLoading: false,
    isPinned: false,
    onToggleFlag: vi.fn(),
    onTogglePin: vi.fn(),
    ...overrides,
  }
  render(<QuizCardHeader {...props} />)
  return props
}

describe('QuizCardHeader', () => {
  it('shows the counter as a semibold label and the code muted', () => {
    renderHeader()
    expect(screen.getByText('Question 2 of 5')).toHaveClass('text-label', 'font-semibold')
    expect(screen.getByText('No. 050-01-01-002')).toHaveClass('text-muted-foreground')
  })

  it('omits the code when the question has none', () => {
    renderHeader({ questionNumber: null })
    expect(screen.queryByText(/No\./)).toBeNull()
  })

  it('reflects flag and pin state in aria-pressed with constant names', () => {
    renderHeader({ isFlagged: true, isPinned: false })
    expect(screen.getByRole('button', { name: 'Flag question' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Pin question' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('fills the icon only while a toggle is on', () => {
    renderHeader({ isFlagged: true })
    expect(screen.getByRole('button', { name: 'Flag question' }).querySelector('svg')).toHaveClass(
      'fill-current',
    )
    expect(
      screen.getByRole('button', { name: 'Pin question' }).querySelector('svg'),
    ).not.toHaveClass('fill-current')
  })

  it('calls the toggle handlers', () => {
    const props = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Flag question' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin question' }))
    expect(props.onToggleFlag).toHaveBeenCalledOnce()
    expect(props.onTogglePin).toHaveBeenCalledOnce()
  })

  it('removes Flag when flagging is not allowed', () => {
    renderHeader({ canFlag: false })
    expect(screen.queryByRole('button', { name: 'Flag question' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pin question' })).toBeInTheDocument()
  })

  it('disables Flag while its request is in flight', () => {
    renderHeader({ flagLoading: true })
    expect(screen.getByRole('button', { name: 'Flag question' })).toBeDisabled()
  })
})
