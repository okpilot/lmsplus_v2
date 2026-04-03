import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QuizControls } from './quiz-controls'

type ControlProps = {
  isPinned?: boolean
  isFlagged?: boolean
  currentIndex?: number
  totalQuestions?: number
  submitting?: boolean
  showSubmit?: boolean
  flagLoading?: boolean
  onTogglePin?: () => void
  onToggleFlag?: () => void
  onPrev?: () => void
  onNext?: () => void
  onSubmitAnswer?: () => void
}

function renderControls(overrides: ControlProps = {}) {
  const defaults: Required<ControlProps> = {
    isPinned: false,
    isFlagged: false,
    currentIndex: 1,
    totalQuestions: 5,
    submitting: false,
    showSubmit: false,
    flagLoading: false,
    onTogglePin: vi.fn(),
    onToggleFlag: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onSubmitAnswer: vi.fn(),
  }
  const props = { ...defaults, ...overrides }
  render(<QuizControls {...props} />)
  return props
}

// ---- Tests ------------------------------------------------------------------

describe('QuizControls — Flag button (ActionButton)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders "Flag" label when not flagged', () => {
    renderControls({ isFlagged: false })
    expect(screen.getByTestId('flag-button')).toHaveTextContent('Flag')
  })

  it('renders "Unflag" label when flagged', () => {
    renderControls({ isFlagged: true })
    expect(screen.getByTestId('flag-button')).toHaveTextContent('Unflag')
  })

  it('sets aria-pressed=false when not flagged', () => {
    renderControls({ isFlagged: false })
    expect(screen.getByTestId('flag-button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('sets aria-pressed=true when flagged', () => {
    renderControls({ isFlagged: true })
    expect(screen.getByTestId('flag-button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onToggleFlag when the Flag button is clicked', () => {
    const onToggleFlag = vi.fn()
    renderControls({ onToggleFlag })
    fireEvent.click(screen.getByTestId('flag-button'))
    expect(onToggleFlag).toHaveBeenCalledOnce()
  })

  it('applies the active orange class when flagged', () => {
    renderControls({ isFlagged: true })
    expect(screen.getByTestId('flag-button').className).toContain('bg-orange-500/10')
  })

  it('does not apply the orange class when not flagged', () => {
    renderControls({ isFlagged: false })
    expect(screen.getByTestId('flag-button').className).not.toContain('bg-orange-500/10')
  })
})

describe('QuizControls — Pin button (ActionButton)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders "Pin" label when not pinned', () => {
    renderControls({ isPinned: false })
    expect(screen.getByTestId('pin-button')).toHaveTextContent('Pin')
  })

  it('renders "Unpin" label when pinned', () => {
    renderControls({ isPinned: true })
    expect(screen.getByTestId('pin-button')).toHaveTextContent('Unpin')
  })

  it('sets aria-pressed=false when not pinned', () => {
    renderControls({ isPinned: false })
    expect(screen.getByTestId('pin-button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('sets aria-pressed=true when pinned', () => {
    renderControls({ isPinned: true })
    expect(screen.getByTestId('pin-button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onTogglePin when the Pin button is clicked', () => {
    const onTogglePin = vi.fn()
    renderControls({ onTogglePin })
    fireEvent.click(screen.getByTestId('pin-button'))
    expect(onTogglePin).toHaveBeenCalledOnce()
  })

  it('applies the active amber class when pinned', () => {
    renderControls({ isPinned: true })
    expect(screen.getByTestId('pin-button').className).toContain('bg-primary/10')
  })

  it('does not apply the amber class when not pinned', () => {
    renderControls({ isPinned: false })
    expect(screen.getByTestId('pin-button').className).not.toContain('bg-primary/10')
  })
})

describe('QuizControls — Flag button loading state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('flag button is enabled by default when flagLoading is not provided', () => {
    renderControls()
    expect(screen.getByTestId('flag-button')).not.toBeDisabled()
  })

  it('disables the flag button when flagLoading is true', () => {
    renderControls({ flagLoading: true })
    expect(screen.getByTestId('flag-button')).toBeDisabled()
  })

  it('does not call onToggleFlag when flag button is disabled via flagLoading', () => {
    const onToggleFlag = vi.fn()
    renderControls({ flagLoading: true, onToggleFlag })
    // fireEvent bypasses pointer-events:none so we check the disabled attribute
    expect(screen.getByTestId('flag-button')).toBeDisabled()
  })

  it('re-enables flag button when flagLoading returns to false', () => {
    const { rerender } = render(
      <QuizControls
        isPinned={false}
        isFlagged={false}
        currentIndex={1}
        totalQuestions={5}
        submitting={false}
        showSubmit={false}
        flagLoading={true}
        onTogglePin={vi.fn()}
        onToggleFlag={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSubmitAnswer={vi.fn()}
      />,
    )
    expect(screen.getByTestId('flag-button')).toBeDisabled()
    rerender(
      <QuizControls
        isPinned={false}
        isFlagged={false}
        currentIndex={1}
        totalQuestions={5}
        submitting={false}
        showSubmit={false}
        flagLoading={false}
        onTogglePin={vi.fn()}
        onToggleFlag={vi.fn()}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSubmitAnswer={vi.fn()}
      />,
    )
    expect(screen.getByTestId('flag-button')).not.toBeDisabled()
  })
})

describe('QuizControls — Submit Answer button', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('does not render Submit Answer button when showSubmit is false', () => {
    renderControls({ showSubmit: false })
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
  })

  it('calls onSubmitAnswer when Submit Answer is clicked', () => {
    const onSubmitAnswer = vi.fn()
    renderControls({ showSubmit: true, onSubmitAnswer })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    expect(onSubmitAnswer).toHaveBeenCalledOnce()
  })

  it('disables Submit Answer when submitting', () => {
    renderControls({ showSubmit: true, submitting: true })
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDisabled()
  })
})
