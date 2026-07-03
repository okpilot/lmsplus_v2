import { describe, expect, it, vi } from 'vitest'
import {
  buildFinishDialogHandlers,
  deriveFinishDialogView,
  getSubmitButtonLabel,
} from './finish-quiz-dialog-helpers'

describe('deriveFinishDialogView', () => {
  it('counts unanswered questions from the answered total', () => {
    const view = deriveFinishDialogView({ answeredCount: 3, totalQuestions: 5 })
    expect(view.unanswered).toBe(2)
  })

  it('titles a plain quiz "Finish Quiz" with no exam label', () => {
    const view = deriveFinishDialogView({ answeredCount: 0, totalQuestions: 5 })
    expect(view.title).toBe('Finish Quiz')
    expect(view.examLabel).toBeNull()
    expect(view.isInternalExam).toBe(false)
  })

  it('labels a mock exam and titles it with that label', () => {
    const view = deriveFinishDialogView({
      answeredCount: 5,
      totalQuestions: 5,
      isExam: true,
      examMode: 'mock_exam',
    })
    expect(view.examLabel).toBe('Practice Exam')
    expect(view.title).toBe('Finish Practice Exam')
    expect(view.isInternalExam).toBe(false)
  })

  it('flags an internal exam as internal', () => {
    const view = deriveFinishDialogView({
      answeredCount: 5,
      totalQuestions: 5,
      isExam: true,
      examMode: 'internal_exam',
    })
    expect(view.isInternalExam).toBe(true)
  })

  it('allows dismissing and discarding a normal quiz', () => {
    const view = deriveFinishDialogView({ answeredCount: 5, totalQuestions: 5 })
    expect(view.canDismiss).toBe(true)
    expect(view.canDiscard).toBe(true)
  })

  it('blocks dismiss and discard once an exam timer has expired', () => {
    const view = deriveFinishDialogView({
      answeredCount: 5,
      totalQuestions: 5,
      isExam: true,
      examMode: 'mock_exam',
      timeExpired: true,
    })
    expect(view.canDismiss).toBe(false)
    expect(view.canDiscard).toBe(false)
  })

  it('allows dismiss but blocks discard for an internal exam still in progress', () => {
    const view = deriveFinishDialogView({
      answeredCount: 5,
      totalQuestions: 5,
      isExam: true,
      examMode: 'internal_exam',
    })
    expect(view.canDismiss).toBe(true)
    expect(view.canDiscard).toBe(false)
  })
})

describe('getSubmitButtonLabel', () => {
  it('shows a submitting label while the submit is in flight', () => {
    expect(
      getSubmitButtonLabel({
        isSubmitting: true,
        isExam: true,
        examLabel: 'Practice Exam',
        answeredCount: 5,
      }),
    ).toBe('Submitting...')
  })

  it('labels the submit with the exam name when in an exam', () => {
    expect(
      getSubmitButtonLabel({
        isSubmitting: false,
        isExam: true,
        examLabel: 'Practice Exam',
        answeredCount: 5,
      }),
    ).toBe('Submit Practice Exam')
  })

  it('falls back to a generic exam label when the exam name is missing', () => {
    expect(getSubmitButtonLabel({ isSubmitting: false, isExam: true, answeredCount: 5 })).toBe(
      'Submit Exam',
    )
  })

  it('falls back to a generic exam label when the exam name is explicitly null', () => {
    // deriveFinishDialogView yields examLabel: string | null, so the runtime value
    // for an exam can be null (not just undefined) — assert the ?? fallback still fires.
    expect(
      getSubmitButtonLabel({
        isSubmitting: false,
        isExam: true,
        examLabel: null,
        answeredCount: 5,
      }),
    ).toBe('Submit Exam')
  })

  it('offers to submit a plain quiz once at least one question is answered', () => {
    expect(getSubmitButtonLabel({ isSubmitting: false, answeredCount: 1 })).toBe('Submit Quiz')
  })

  it('prompts to answer a question when none are answered yet', () => {
    expect(getSubmitButtonLabel({ isSubmitting: false, answeredCount: 0 })).toBe(
      'Answer at least one question',
    )
  })
})

describe('buildFinishDialogHandlers', () => {
  function makeDeps(overrides: Partial<Parameters<typeof buildFinishDialogHandlers>[0]> = {}) {
    return {
      canDismiss: true,
      unanswered: 0,
      confirmingSubmit: false,
      timeExpired: false,
      onCancel: vi.fn(),
      onSubmit: vi.fn(),
      setConfirmingDiscard: vi.fn(),
      setConfirmingSubmit: vi.fn(),
      ...overrides,
    }
  }

  it('cancels and closes when dismissing is allowed', () => {
    const deps = makeDeps()
    buildFinishDialogHandlers(deps).handleClose()
    expect(deps.setConfirmingDiscard).toHaveBeenCalledWith(false)
    expect(deps.setConfirmingSubmit).toHaveBeenCalledWith(false)
    expect(deps.onCancel).toHaveBeenCalled()
  })

  it('does nothing on close when dismissing is blocked', () => {
    const deps = makeDeps({ canDismiss: false })
    buildFinishDialogHandlers(deps).handleClose()
    expect(deps.onCancel).not.toHaveBeenCalled()
    expect(deps.setConfirmingDiscard).not.toHaveBeenCalled()
  })

  it('asks to confirm submit when questions are unanswered', () => {
    const deps = makeDeps({ unanswered: 2 })
    buildFinishDialogHandlers(deps).handleSubmitClick()
    expect(deps.setConfirmingSubmit).toHaveBeenCalledWith(true)
    expect(deps.onSubmit).not.toHaveBeenCalled()
  })

  it('submits directly once the unanswered submit is confirmed', () => {
    const deps = makeDeps({ unanswered: 2, confirmingSubmit: true })
    buildFinishDialogHandlers(deps).handleSubmitClick()
    expect(deps.onSubmit).toHaveBeenCalled()
  })

  it('submits directly when every question is answered', () => {
    const deps = makeDeps({ unanswered: 0 })
    buildFinishDialogHandlers(deps).handleSubmitClick()
    expect(deps.onSubmit).toHaveBeenCalled()
  })

  it('submits without confirmation when the timer expired even with blanks', () => {
    const deps = makeDeps({ unanswered: 2, timeExpired: true })
    buildFinishDialogHandlers(deps).handleSubmitClick()
    expect(deps.onSubmit).toHaveBeenCalled()
    expect(deps.setConfirmingSubmit).not.toHaveBeenCalledWith(true)
  })

  it('opens the discard confirmation and clears the submit confirmation', () => {
    const deps = makeDeps()
    buildFinishDialogHandlers(deps).openDiscardConfirm()
    expect(deps.setConfirmingSubmit).toHaveBeenCalledWith(false)
    expect(deps.setConfirmingDiscard).toHaveBeenCalledWith(true)
  })

  it('clears the submit confirmation on cancel', () => {
    const deps = makeDeps()
    buildFinishDialogHandlers(deps).cancelSubmitConfirm()
    expect(deps.setConfirmingSubmit).toHaveBeenCalledWith(false)
  })

  it('clears the discard confirmation on cancel', () => {
    const deps = makeDeps()
    buildFinishDialogHandlers(deps).cancelDiscardConfirm()
    expect(deps.setConfirmingDiscard).toHaveBeenCalledWith(false)
  })

  it('clears the discard confirmation as a side effect of every submit click', () => {
    const deps = makeDeps({ unanswered: 0 })
    buildFinishDialogHandlers(deps).handleSubmitClick()
    expect(deps.setConfirmingDiscard).toHaveBeenCalledWith(false)
  })
})
