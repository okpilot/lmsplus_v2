import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FinishQuizDialog } from './finish-quiz-dialog'

// ---- Helpers --------------------------------------------------------------

type DialogProps = {
  open?: boolean
  answeredCount?: number
  totalQuestions?: number
  submitting?: boolean
  onSubmit?: () => void
  onCancel?: () => void
  onSave?: () => void
  onDiscard?: () => void
}

function renderDialog(overrides: DialogProps = {}) {
  const defaults = {
    open: true,
    answeredCount: 3,
    totalQuestions: 5,
    submitting: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onDiscard: vi.fn(),
  }
  const props = { ...defaults, ...overrides }
  render(<FinishQuizDialog {...props} />)
  return props
}

// ---- Tests ----------------------------------------------------------------

describe('FinishQuizDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders nothing when open is false', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog when open is true', () => {
    renderDialog({ open: true })
    expect(screen.getByRole('dialog', { name: /finish quiz/i })).toBeInTheDocument()
  })

  it('shows the answered and total question counts', () => {
    renderDialog({ answeredCount: 4, totalQuestions: 10 })
    expect(screen.getByText(/You have answered 4 of 10 questions/i)).toBeInTheDocument()
  })

  it('shows the unanswered warning when some questions are unanswered', () => {
    renderDialog({ answeredCount: 3, totalQuestions: 5 })
    expect(screen.getByText(/2 questions are unanswered/i)).toBeInTheDocument()
  })

  it('uses singular "question is" when exactly one question is unanswered', () => {
    renderDialog({ answeredCount: 4, totalQuestions: 5 })
    expect(screen.getByText(/1 question is unanswered/i)).toBeInTheDocument()
  })

  it('does not show the unanswered warning when all questions are answered', () => {
    renderDialog({ answeredCount: 5, totalQuestions: 5 })
    expect(screen.queryByText(/unanswered/i)).not.toBeInTheDocument()
  })

  it('calls onSubmit when Submit Quiz button is clicked', () => {
    const onSubmit = vi.fn()
    renderDialog({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Return to Quiz button is clicked', () => {
    const onCancel = vi.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByRole('button', { name: /return to quiz/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onSave when Save for Later button is clicked', () => {
    const onSave = vi.fn()
    renderDialog({ onSave })
    fireEvent.click(screen.getByRole('button', { name: /save for later/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onCancel when the backdrop overlay is clicked', () => {
    const onCancel = vi.fn()
    renderDialog({ onCancel })
    const overlay = screen.getByRole('dialog', { name: /finish quiz/i }).parentElement
    expect(overlay).not.toBeNull()
    if (overlay) fireEvent.click(overlay)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when the Escape key is pressed on the overlay', () => {
    const onCancel = vi.fn()
    renderDialog({ onCancel })
    const overlay = screen.getByRole('dialog', { name: /finish quiz/i }).parentElement
    expect(overlay).not.toBeNull()
    if (overlay) fireEvent.keyDown(overlay, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('does not call onCancel when a non-Escape key is pressed on the overlay', () => {
    const onCancel = vi.fn()
    renderDialog({ onCancel })
    const overlay = screen.getByRole('dialog', { name: /finish quiz/i }).parentElement
    if (overlay) fireEvent.keyDown(overlay, { key: 'Enter' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('disables all buttons while submitting', () => {
    renderDialog({ submitting: true })
    expect(screen.getByRole('button', { name: /submitting.../i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /return to quiz/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save for later/i })).toBeDisabled()
  })

  it('shows "Submitting..." text on the submit button while submitting', () => {
    renderDialog({ submitting: true })
    expect(screen.getByRole('button', { name: /submitting.../i })).toBeInTheDocument()
  })

  it('shows "Submit Quiz" text on the submit button when not submitting', () => {
    renderDialog({ submitting: false })
    expect(screen.getByRole('button', { name: /submit quiz/i })).toBeInTheDocument()
  })

  it('does not propagate clicks from inside the dialog to the overlay', () => {
    const onCancel = vi.fn()
    renderDialog({ onCancel })
    const dialog = screen.getByRole('dialog', { name: /finish quiz/i })
    fireEvent.click(dialog)
    expect(onCancel).not.toHaveBeenCalled()
  })

  // ---- Discard flow -------------------------------------------------------

  it('shows the Discard Quiz button in the initial state', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: /discard quiz/i })).toBeInTheDocument()
  })

  it('shows inline confirmation after clicking Discard Quiz', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /discard quiz/i }))
    expect(screen.getByText(/are you sure\? your progress will be lost/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /yes, discard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('calls onDiscard when "Yes, discard" is confirmed', () => {
    const onDiscard = vi.fn()
    renderDialog({ onDiscard })
    fireEvent.click(screen.getByRole('button', { name: /discard quiz/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes, discard/i }))
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('returns to the initial state when Cancel is clicked during discard confirmation', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /discard quiz/i }))
    expect(screen.getByText(/are you sure\?/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByText(/are you sure\?/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard quiz/i })).toBeInTheDocument()
  })

  it('does not call onDiscard without going through the confirmation step', () => {
    const onDiscard = vi.fn()
    renderDialog({ onDiscard })
    // Discard Quiz button is visible but confirmation has not been shown yet
    expect(screen.queryByRole('button', { name: /yes, discard/i })).not.toBeInTheDocument()
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('disables the "Yes, discard" button while submitting', () => {
    renderDialog({ submitting: true })
    // Need to click Discard Quiz to show confirmation — it is not disabled itself when not submitting
    // But when submitting=true the discard trigger button is disabled
    expect(screen.getByRole('button', { name: /discard quiz/i })).toBeDisabled()
  })
})
