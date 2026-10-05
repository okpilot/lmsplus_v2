import { describe, expect, it } from 'vitest'
import { toAnswerJson } from '@/app/app/quiz/actions/quiz-progress-helpers'
import type { DraftAnswer } from '@/app/app/quiz/types'
import { buildSessionSeed } from './quiz-session-seed'

const Q1 = '11111111-1111-4111-8111-111111111111'
const Q2 = '22222222-2222-4222-8222-222222222222'
const Q3 = '33333333-3333-4333-8333-333333333333'
const OUTSIDE = '99999999-9999-4999-8999-999999999999'
const IDS = [Q1, Q2, Q3]

function seed(over: Partial<Parameters<typeof buildSessionSeed>[0]> = {}) {
  return buildSessionSeed({
    rows: [],
    questionIds: IDS,
    pinnedQuestionIds: [],
    currentIndex: 0,
    ...over,
  })
}

describe('buildSessionSeed', () => {
  it.each<[string, Omit<DraftAnswer, 'responseTimeMs'>]>([
    ['multiple choice', { selectedOptionId: 'c' }],
    ['short answer', { responseText: 'QNH' }],
    ['dialog fill', { blankAnswers: [{ index: 0, text: 'roger' }] }],
    ['ordering', { order: ['x', 'y', 'z'] }],
    ['diagram label', { mapping: [{ zoneId: 'z1', labelId: 'l1' }] }],
  ])('restores a saved %s answer exactly as the student gave it', (_label, answer) => {
    const saved = toAnswerJson(answer as Parameters<typeof toAnswerJson>[0])

    const result = seed({ rows: [{ question_id: Q1, answer: saved, time_spent_ms: 4200 }] })

    expect(result.answers).toEqual({ [Q1]: { ...answer, responseTimeMs: 4200 } })
  })

  it('counts the time of a viewed-only question without recording an answer', () => {
    const result = seed({
      rows: [
        { question_id: Q1, answer: { selected_option_id: 'a' }, time_spent_ms: 1000 },
        { question_id: Q2, answer: null, time_spent_ms: 2500 },
      ],
    })

    expect(result.activeMs).toBe(3500)
    expect(Object.keys(result.answers)).toEqual([Q1])
  })

  it('skips an answer of an unknown shape instead of throwing', () => {
    const result = seed({
      rows: [
        { question_id: Q1, answer: { surprise: true }, time_spent_ms: 10 },
        { question_id: Q2, answer: { selected_option_id: 'z' }, time_spent_ms: 10 },
        { question_id: Q3, answer: 'text', time_spent_ms: 10 },
      ],
    })

    expect(result.answers).toEqual({})
  })

  it('drops rows for questions outside the session config', () => {
    const result = seed({
      rows: [
        { question_id: OUTSIDE, answer: { selected_option_id: 'a' }, time_spent_ms: 9000 },
        { question_id: Q1, answer: { selected_option_id: 'b' }, time_spent_ms: 100 },
      ],
    })

    expect(Object.keys(result.answers)).toEqual([Q1])
    expect(result.activeMs).toBe(100)
  })

  it('clamps the saved position into the question list', () => {
    expect(seed({ currentIndex: 99 }).currentIndex).toBe(2)
    expect(seed({ currentIndex: -4 }).currentIndex).toBe(0)
    expect(seed({ currentIndex: 1 }).currentIndex).toBe(1)
  })

  it('keeps only pins that belong to the session', () => {
    expect(seed({ pinnedQuestionIds: [Q2, OUTSIDE] }).pinnedQuestionIds).toEqual([Q2])
  })
})
