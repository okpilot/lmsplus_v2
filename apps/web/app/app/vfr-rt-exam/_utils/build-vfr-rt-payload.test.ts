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
})
