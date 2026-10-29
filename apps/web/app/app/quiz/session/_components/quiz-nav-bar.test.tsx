import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuizNavBar } from './quiz-nav-bar'

function renderNavBar(overrides: Partial<React.ComponentProps<typeof QuizNavBar>> = {}) {
  const props = {
    currentIndex: 1,
    totalQuestions: 5,
    action: 'next' as const,
    canSubmit: false,
    submitting: false,
    isExam: false,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
  render(<QuizNavBar {...props} />)
  return props
}

describe('QuizNavBar', () => {
  it('renders Previous as a ghost button', () => {
    renderNavBar()
    expect(screen.getByRole('button', { name: /previous/i })).not.toHaveClass('border-border')
  })

  it('disables Previous on the first question and enables it otherwise', () => {
    renderNavBar({ currentIndex: 0 })
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('enables Previous when not on the first question and calls onPrev', () => {
    const { onPrev } = renderNavBar({ currentIndex: 2 })
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('shows Next in the slot after an answer and calls onNext', () => {
    const { onNext } = renderNavBar({ currentIndex: 0, totalQuestions: 3 })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /submit answer/i })).toBeNull()
  })

  it('disables Next on the last question', () => {
    renderNavBar({ currentIndex: 4, totalQuestions: 5 })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('disables Submit Answer until an option is picked', () => {
    renderNavBar({ action: 'submit', canSubmit: false })
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull()
  })

  it('submits the picked option from the slot', () => {
    const { onSubmit } = renderNavBar({ action: 'submit', canSubmit: true })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('labels the slot Confirm Answer in exam mode', () => {
    renderNavBar({ action: 'submit', canSubmit: true, isExam: true })
    expect(screen.getByRole('button', { name: 'Confirm Answer' })).toBeEnabled()
  })

  it('disables the slot and marks it busy while the answer is in flight', () => {
    renderNavBar({ action: 'submit', canSubmit: true, submitting: true })
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /submit answer/i })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('renders nothing in the slot when there is no action', () => {
    renderNavBar({ action: 'none' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
