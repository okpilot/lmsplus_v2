import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock FinishQuizDialog — it has its own test file and brings internal state
// that is not under test here. We just need to know when it is open.
vi.mock('../../_components/finish-quiz-dialog', () => ({
  FinishQuizDialog: ({
    open,
    onSubmit,
    onCancel,
    onSave,
    onDiscard,
  }: {
    open: boolean
    onSubmit: () => void
    onCancel: () => void
    onSave: () => void
    onDiscard: () => void
  }) =>
    open ? (
      <div data-testid="finish-dialog">
        <button type="button" onClick={onSubmit}>
          Submit Quiz
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={onSave}>
          Save for Later
        </button>
        <button type="button" onClick={onDiscard}>
          Discard Quiz
        </button>
      </div>
    ) : null,
}))

// QuizNavBar is rendered inside QuizControls — import after mock registration
import { QuizControls } from './quiz-controls'

type ControlProps = {
  isPinned?: boolean
  isFlagged?: boolean
  currentIndex?: number
  totalQuestions?: number
  answeredCount?: number
  submitting?: boolean
  showFinishDialog?: boolean
  onTogglePin?: () => void
  onToggleFlag?: () => void
  onPrev?: () => void
  onNext?: () => void
  onSubmit?: () => void
  onCancel?: () => void
  onSave?: () => void
  onDiscard?: () => void
}

function renderControls(overrides: ControlProps = {}) {
  const defaults: Required<ControlProps> = {
    isPinned: false,
    isFlagged: false,
    currentIndex: 1,
    totalQuestions: 5,
    answeredCount: 2,
    submitting: false,
    showFinishDialog: false,
    onTogglePin: vi.fn(),
    onToggleFlag: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onDiscard: vi.fn(),
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
    expect(screen.getByTestId('flag-button').className).toContain('border-orange-400')
  })

  it('does not apply the orange class when not flagged', () => {
    renderControls({ isFlagged: false })
    expect(screen.getByTestId('flag-button').className).not.toContain('border-orange-400')
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
    expect(screen.getByTestId('pin-button').className).toContain('border-amber-400')
  })

  it('does not apply the amber class when not pinned', () => {
    renderControls({ isPinned: false })
    expect(screen.getByTestId('pin-button').className).not.toContain('border-amber-400')
  })
})

describe('QuizControls — FinishQuizDialog integration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('does not render the dialog when showFinishDialog is false', () => {
    renderControls({ showFinishDialog: false })
    expect(screen.queryByTestId('finish-dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog when showFinishDialog is true', () => {
    renderControls({ showFinishDialog: true })
    expect(screen.getByTestId('finish-dialog')).toBeInTheDocument()
  })

  it('calls onSubmit when Submit Quiz is clicked in the dialog', () => {
    const onSubmit = vi.fn()
    renderControls({ showFinishDialog: true, onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Cancel is clicked in the dialog', () => {
    const onCancel = vi.fn()
    renderControls({ showFinishDialog: true, onCancel })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onSave when Save for Later is clicked in the dialog', () => {
    const onSave = vi.fn()
    renderControls({ showFinishDialog: true, onSave })
    fireEvent.click(screen.getByRole('button', { name: /save for later/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onDiscard when Discard Quiz is clicked in the dialog', () => {
    const onDiscard = vi.fn()
    renderControls({ showFinishDialog: true, onDiscard })
    fireEvent.click(screen.getByRole('button', { name: /discard quiz/i }))
    expect(onDiscard).toHaveBeenCalledOnce()
  })
})
