import { describe, expect, it } from 'vitest'
import type { AnswerState } from '../_hooks/use-vfr-rt-answers'
import { buildVfrRtPayload } from './build-vfr-rt-payload'

const questions = [
  { id: 'q-short', question_type: 'short_answer' },
  { id: 'q-mc', question_type: 'multiple_choice' },
  { id: 'q-dialog', question_type: 'dialog_fill' },
]

describe('buildVfrRtPayload', () => {
  it('maps a multiple-choice selection to a selectedOptionId entry', () => {
    const answers: Record<string, AnswerState> = { 'q-mc': { mc: 'opt-b' } }
    expect(buildVfrRtPayload(questions, answers)).toContainEqual({
      questionId: 'q-mc',
      selectedOptionId: 'opt-b',
    })
  })

  it('maps a short answer to a responseText entry', () => {
    const answers: Record<string, AnswerState> = { 'q-short': { short: 'QNH' } }
    expect(buildVfrRtPayload(questions, answers)).toContainEqual({
      questionId: 'q-short',
      responseText: 'QNH',
    })
  })

  it('trims padded response text on short answers and dialog blanks', () => {
    const answers: Record<string, AnswerState> = {
      'q-short': { short: '  QNH  ' },
      'q-dialog': { blanks: { 0: '  cleared  ' } },
    }
    const result = buildVfrRtPayload(questions, answers)
    expect(result).toContainEqual({ questionId: 'q-short', responseText: 'QNH' })
    expect(result).toContainEqual({
      questionId: 'q-dialog',
      blankIndex: 0,
      responseText: 'cleared',
    })
  })

  it('maps each dialog blank to its own entry', () => {
    const answers: Record<string, AnswerState> = {
      'q-dialog': { blanks: { 0: 'cleared', 1: 'takeoff' } },
    }
    const result = buildVfrRtPayload(questions, answers)
    expect(result).toContainEqual({
      questionId: 'q-dialog',
      blankIndex: 0,
      responseText: 'cleared',
    })
    expect(result).toContainEqual({
      questionId: 'q-dialog',
      blankIndex: 1,
      responseText: 'takeoff',
    })
    expect(result).toHaveLength(2)
  })

  it('skips whitespace-only and empty short answers', () => {
    const answers: Record<string, AnswerState> = { 'q-short': { short: '   ' } }
    expect(buildVfrRtPayload(questions, answers)).toEqual([])
  })

  it('skips whitespace-only dialog blanks', () => {
    const answers: Record<string, AnswerState> = {
      'q-dialog': { blanks: { 0: 'cleared', 1: '  ' } },
    }
    const result = buildVfrRtPayload(questions, answers)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ questionId: 'q-dialog', blankIndex: 0, responseText: 'cleared' })
  })

  it('produces no entry for an unanswered question', () => {
    expect(buildVfrRtPayload(questions, {})).toEqual([])
  })

  it('skips a multiple-choice question when the answer object has no mc field', () => {
    // An answer recorded for a previous type (e.g. short) ending up keyed to a
    // MC question must not produce a selectedOptionId entry — `answer.mc` is
    // undefined, so the `if (answer.mc)` guard must skip it cleanly.
    const answers: Record<string, AnswerState> = { 'q-mc': { short: 'stale' } }
    expect(buildVfrRtPayload(questions, answers)).toEqual([])
  })

  it('emits only the filled blanks when a dialog question has a mix of filled and empty blanks', () => {
    // Three blanks: indices 0 and 2 filled, index 1 empty — only 0 and 2 appear.
    const answers: Record<string, AnswerState> = {
      'q-dialog': { blanks: { 0: 'cleared', 1: '', 2: 'final' } },
    }
    const result = buildVfrRtPayload(questions, answers)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      questionId: 'q-dialog',
      blankIndex: 0,
      responseText: 'cleared',
    })
    expect(result).toContainEqual({ questionId: 'q-dialog', blankIndex: 2, responseText: 'final' })
  })
})
