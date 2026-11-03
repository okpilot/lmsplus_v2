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
  })

  it('shows a ghost Next beside Submit that calls onNext, with Submit rightmost (AC1)', () => {
    const { onNext } = renderNavBar({ action: 'submit', canSubmit: true, currentIndex: 0 })
    const next = screen.getByRole('button', { name: /next/i })
    const submit = screen.getByRole('button', { name: 'Submit Answer' })
    expect(next).not.toHaveClass('bg-primary')
    expect(next).toBeEnabled()
    const all = screen.getAllByRole('button')
    expect(all.indexOf(next)).toBeLessThan(all.indexOf(submit))
    expect(all.indexOf(submit)).toBe(all.length - 1)
    fireEvent.click(next)
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('disables the ghost Next beside Submit on the last question (AC1)', () => {
    renderNavBar({ action: 'submit', canSubmit: true, currentIndex: 4, totalQuestions: 5 })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('shows the ghost Next beside Confirm Answer in exam mode (AC1)', () => {
    renderNavBar({ action: 'submit', canSubmit: true, isExam: true })
    expect(screen.getByRole('button', { name: /next/i })).not.toHaveClass('bg-primary')
    expect(screen.getByRole('button', { name: 'Confirm Answer' })).toBeInTheDocument()
  })

  it('renders a primary Next without Submit after an answer (AC3)', () => {
    renderNavBar({ action: 'next' })
    expect(screen.getByRole('button', { name: /next/i })).toHaveClass('bg-primary')
    expect(screen.queryByRole('button', { name: /submit|confirm/i })).toBeNull()
  })

  it('disables the ghost Next while the answer is in flight (AC6)', () => {
    renderNavBar({ action: 'submit', canSubmit: true, submitting: true })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
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

  it('renders a ghost Next that calls onNext when there is no action (AC2)', () => {
    const { onNext } = renderNavBar({ action: 'none', currentIndex: 0 })
    expect(screen.getAllByRole('button')).toHaveLength(2)
    const next = screen.getByRole('button', { name: /next/i })
    expect(next).not.toHaveClass('bg-primary')
    fireEvent.click(next)
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('disables the ghost Next on the last question when there is no action (AC2)', () => {
    renderNavBar({ action: 'none', currentIndex: 4, totalQuestions: 5 })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })
})
