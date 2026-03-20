import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuizNavBar } from './quiz-nav-bar'

// ---- Helpers --------------------------------------------------------------

type NavBarProps = {
  currentIndex?: number
  totalQuestions?: number
  onPrev?: () => void
  onNext?: () => void
}

function renderNavBar(overrides: NavBarProps = {}) {
  const defaults = {
    currentIndex: 1,
    totalQuestions: 5,
    onPrev: vi.fn(),
    onNext: vi.fn(),
  }
  const props = { ...defaults, ...overrides }
  render(<QuizNavBar {...props} />)
  return props
}

// ---- Tests ----------------------------------------------------------------

describe('QuizNavBar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders Previous and Next buttons', () => {
    renderNavBar()
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('disables Previous button on the first question', () => {
    renderNavBar({ currentIndex: 0, totalQuestions: 5 })
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('enables Previous button when not on the first question', () => {
    renderNavBar({ currentIndex: 1, totalQuestions: 5 })
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled()
  })

  it('disables Next button on the last question', () => {
    renderNavBar({ currentIndex: 4, totalQuestions: 5 })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('enables Next button when not on the last question', () => {
    renderNavBar({ currentIndex: 3, totalQuestions: 5 })
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('disables Previous and enables Next on the first question of a single-question quiz', () => {
    renderNavBar({ currentIndex: 0, totalQuestions: 1 })
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    // totalQuestions - 1 === 0 === currentIndex, so Next is also disabled
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('calls onPrev when Previous is clicked', () => {
    const onPrev = vi.fn()
    renderNavBar({ onPrev, currentIndex: 2 })
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('calls onNext when Next is clicked', () => {
    const onNext = vi.fn()
    renderNavBar({ onNext, currentIndex: 0, totalQuestions: 3 })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledOnce()
  })
})
