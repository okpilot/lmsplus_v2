import { describe, expect, it, vi } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { DraftAnswer } from '../../types'
import { type AssembleQuizStateInput, assembleQuizState } from './quiz-state-assembly'

const QUESTION = { id: 'q1' } as unknown as SessionQuestion

function makePipeline(overrides: Partial<AssembleQuizStateInput['p']> = {}) {
  return {
    feedback: new Map(),
    answering: false,
    handleSelectAnswer: vi.fn(),
    handleTextAnswer: vi.fn(),
    handleDialogFillAnswer: vi.fn(),
    handleOrderingAnswer: vi.fn(),
    handleDiagramLabelAnswer: vi.fn(),
    navigateTo: vi.fn(),
    navigate: vi.fn(),
    submitted: { current: false },
    error: null,
    submitting: false,
    pendingAction: null,
    handleSubmit: vi.fn(),
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
    showFinishDialog: false,
    setShowFinishDialog: vi.fn(),
    ...overrides,
  } as unknown as AssembleQuizStateInput['p']
}

function makeInput(overrides: Partial<AssembleQuizStateInput> = {}): AssembleQuizStateInput {
  return {
    nav: { currentIndex: 0, seenIndices: new Set([0]) },
    question: QUESTION,
    questionId: 'q1',
    answers: new Map<string, DraftAnswer>(),
    questionIds: ['q1', 'q2'],
    pinnedQuestions: new Set<string>(),
    togglePin: vi.fn(),
    p: makePipeline(),
    isExam: false,
    ...overrides,
  }
}

describe('assembleQuizState', () => {
  it('carries currentIndex and seenIndices through from nav', () => {
    const state = assembleQuizState(
      makeInput({ nav: { currentIndex: 2, seenIndices: new Set([0, 1, 2]) } }),
    )
    expect(state.currentIndex).toBe(2)
    expect(state.seenIndices).toEqual(new Set([0, 1, 2]))
  })

  it('derives answeredCount from the answers map size', () => {
    const answers = new Map<string, DraftAnswer>([
      ['q1', { selectedOptionId: 'a', responseTimeMs: 1 }],
      ['q2', { selectedOptionId: 'b', responseTimeMs: 2 }],
    ])
    const state = assembleQuizState(makeInput({ answers }))
    expect(state.answeredCount).toBe(2)
  })

  it('returns existingAnswer for the current question id', () => {
    const answer: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 1 }
    const answers = new Map<string, DraftAnswer>([['q1', answer]])
    const state = assembleQuizState(makeInput({ answers, questionId: 'q1' }))
    expect(state.existingAnswer).toBe(answer)
  })

  it('returns undefined existingAnswer when the question has not been answered', () => {
    const state = assembleQuizState(makeInput({ answers: new Map(), questionId: 'q1' }))
    expect(state.existingAnswer).toBeUndefined()
  })

  it('returns currentFeedback from the pipeline feedback map, or null when absent', () => {
    const feedback = new Map([['q1', { isCorrect: true }]])
    const state = assembleQuizState(
      makeInput({ questionId: 'q1', p: makePipeline({ feedback: feedback as never }) }),
    )
    expect(state.currentFeedback).toEqual({ isCorrect: true })

    const noFeedbackState = assembleQuizState(
      makeInput({ questionId: 'q9', p: makePipeline({ feedback: feedback as never }) }),
    )
    expect(noFeedbackState.currentFeedback).toBeNull()
  })

  it('passes questionIds through unchanged', () => {
    const state = assembleQuizState(makeInput({ questionIds: ['a', 'b', 'c'] }))
    expect(state.questionIds).toEqual(['a', 'b', 'c'])
  })

  it('derives answeredIds as a Set of the answers map keys', () => {
    const answers = new Map<string, DraftAnswer>([
      ['q1', { selectedOptionId: 'a', responseTimeMs: 1 }],
      ['q2', { selectedOptionId: 'b', responseTimeMs: 2 }],
    ])
    const state = assembleQuizState(makeInput({ answers }))
    expect(state.answeredIds).toEqual(new Set(['q1', 'q2']))
  })

  it('derives isPinned from whether questionId is in pinnedQuestions', () => {
    const pinned = assembleQuizState(
      makeInput({ questionId: 'q1', pinnedQuestions: new Set(['q1']) }),
    )
    expect(pinned.isPinned).toBe(true)

    const notPinned = assembleQuizState(
      makeInput({ questionId: 'q1', pinnedQuestions: new Set(['q2']) }),
    )
    expect(notPinned.isPinned).toBe(false)
  })

  it('wires togglePin through to the provided callback', () => {
    const togglePin = vi.fn()
    const state = assembleQuizState(makeInput({ togglePin }))
    state.togglePin()
    expect(togglePin).toHaveBeenCalledOnce()
  })

  it('forwards isExam and the pipeline-derived submission fields', () => {
    const p = makePipeline({ submitting: true, pendingAction: 'submit', showFinishDialog: true })
    const state = assembleQuizState(makeInput({ isExam: true, p }))
    expect(state.isExam).toBe(true)
    expect(state.submitting).toBe(true)
    expect(state.pendingAction).toBe('submit')
    expect(state.showFinishDialog).toBe(true)
  })

  it('forwards the answer handlers from the pipeline unchanged', () => {
    const p = makePipeline()
    const state = assembleQuizState(makeInput({ p }))
    expect(state.handleSelectAnswer).toBe(p.handleSelectAnswer)
    expect(state.handleTextAnswer).toBe(p.handleTextAnswer)
    expect(state.handleDialogFillAnswer).toBe(p.handleDialogFillAnswer)
    expect(state.handleOrderingAnswer).toBe(p.handleOrderingAnswer)
    expect(state.handleDiagramLabelAnswer).toBe(p.handleDiagramLabelAnswer)
    expect(state.handleSubmit).toBe(p.handleSubmit)
    expect(state.handleSave).toBe(p.handleSave)
    expect(state.handleDiscard).toBe(p.handleDiscard)
    expect(state.navigate).toBe(p.navigate)
    expect(state.navigateTo).toBe(p.navigateTo)
    expect(state.error).toBe(p.error)
    expect(state.answering).toBe(p.answering)
    expect(state.feedback).toBe(p.feedback)
  })

  it('passes the question object through unchanged', () => {
    const state = assembleQuizState(makeInput({ question: QUESTION }))
    expect(state.question).toBe(QUESTION)
  })
})
