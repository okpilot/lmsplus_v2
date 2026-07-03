import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFinishQuizDialog } from './use-finish-quiz-dialog'

function baseOpts(overrides: Partial<Parameters<typeof useFinishQuizDialog>[0]> = {}) {
  return {
    open: true,
    answeredCount: 3,
    totalQuestions: 5,
    submitting: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

describe('useFinishQuizDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('starts with both confirmation flags false', () => {
    const { result } = renderHook(() => useFinishQuizDialog(baseOpts()))
    expect(result.current.confirmingDiscard).toBe(false)
    expect(result.current.confirmingSubmit).toBe(false)
  })

  it('computes unanswered as the difference between total and answered', () => {
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ answeredCount: 2, totalQuestions: 5 })),
    )
    expect(result.current.unanswered).toBe(3)
  })

  // ---- handleSubmitClick two-phase confirm ---------------------------------

  it('enters submit-confirm state on first click when questions are unanswered', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ answeredCount: 3, totalQuestions: 5, onSubmit })),
    )
    act(() => result.current.handleSubmitClick())
    expect(result.current.confirmingSubmit).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit on the second click once submit-confirm is active', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ answeredCount: 3, totalQuestions: 5, onSubmit })),
    )
    act(() => result.current.handleSubmitClick())
    act(() => result.current.handleSubmitClick())
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('calls onSubmit immediately when all questions are answered (no confirm phase)', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ answeredCount: 5, totalQuestions: 5, onSubmit })),
    )
    act(() => result.current.handleSubmitClick())
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(result.current.confirmingSubmit).toBe(false)
  })

  it('calls onSubmit immediately when timeExpired is true (skips confirm phase)', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useFinishQuizDialog(
        baseOpts({ answeredCount: 2, totalQuestions: 5, onSubmit, timeExpired: true }),
      ),
    )
    act(() => result.current.handleSubmitClick())
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('clears confirmingDiscard when handleSubmitClick is invoked', () => {
    const { result } = renderHook(() => useFinishQuizDialog(baseOpts()))
    act(() => result.current.openDiscardConfirm())
    expect(result.current.confirmingDiscard).toBe(true)
    act(() => result.current.handleSubmitClick())
    expect(result.current.confirmingDiscard).toBe(false)
  })

  // ---- discard confirm helpers ---------------------------------------------

  it('openDiscardConfirm sets confirmingDiscard true and clears confirmingSubmit', () => {
    const { result } = renderHook(() => useFinishQuizDialog(baseOpts()))
    act(() => result.current.handleSubmitClick()) // enters confirmingSubmit
    expect(result.current.confirmingSubmit).toBe(true)
    act(() => result.current.openDiscardConfirm())
    expect(result.current.confirmingDiscard).toBe(true)
    expect(result.current.confirmingSubmit).toBe(false)
  })

  it('cancelDiscardConfirm resets confirmingDiscard to false', () => {
    const { result } = renderHook(() => useFinishQuizDialog(baseOpts()))
    act(() => result.current.openDiscardConfirm())
    expect(result.current.confirmingDiscard).toBe(true)
    act(() => result.current.cancelDiscardConfirm())
    expect(result.current.confirmingDiscard).toBe(false)
  })

  it('cancelSubmitConfirm resets confirmingSubmit to false', () => {
    const { result } = renderHook(() => useFinishQuizDialog(baseOpts()))
    act(() => result.current.handleSubmitClick())
    expect(result.current.confirmingSubmit).toBe(true)
    act(() => result.current.cancelSubmitConfirm())
    expect(result.current.confirmingSubmit).toBe(false)
  })

  // ---- handleClose guard ----------------------------------------------------

  it('handleClose calls onCancel and resets both confirm flags when dismiss is allowed', () => {
    const onCancel = vi.fn()
    const { result } = renderHook(() => useFinishQuizDialog(baseOpts({ onCancel })))
    act(() => result.current.openDiscardConfirm())
    act(() => result.current.handleClose())
    expect(onCancel).toHaveBeenCalledOnce()
    expect(result.current.confirmingDiscard).toBe(false)
  })

  it('handleClose does nothing when dismiss is blocked (exam mid-expiry)', () => {
    const onCancel = vi.fn()
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ onCancel, isExam: true, timeExpired: true })),
    )
    act(() => result.current.handleClose())
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('canDismiss is false and canDiscard is false when isExam and timeExpired', () => {
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ isExam: true, timeExpired: true })),
    )
    expect(result.current.canDismiss).toBe(false)
    expect(result.current.canDiscard).toBe(false)
  })

  it('canDiscard is false for internal_exam mode even when dismiss is allowed', () => {
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ isExam: true, examMode: 'internal_exam' })),
    )
    expect(result.current.canDismiss).toBe(true)
    expect(result.current.canDiscard).toBe(false)
  })

  it('derives the exam title from examMode', () => {
    const { result } = renderHook(() =>
      useFinishQuizDialog(baseOpts({ isExam: true, examMode: 'mock_exam' })),
    )
    expect(result.current.title).toMatch(/finish/i)
    expect(result.current.examLabel).not.toBeNull()
  })

  it('uses the plain quiz title when not an exam', () => {
    const { result } = renderHook(() => useFinishQuizDialog(baseOpts()))
    expect(result.current.title).toBe('Finish Quiz')
    expect(result.current.examLabel).toBeNull()
  })
})
