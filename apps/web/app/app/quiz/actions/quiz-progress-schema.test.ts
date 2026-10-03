import { describe, expect, it } from 'vitest'
import { ClaimInput, SaveAnswerInput, SavePositionInput } from './quiz-progress-schema'

const SESSION = '00000000-0000-4000-a000-000000000099'
const QUESTION = '00000000-0000-4000-a000-000000000011'
const DEVICE = '00000000-0000-4000-a000-0000000000d1'
const base = { sessionId: SESSION, questionId: QUESTION, deviceId: DEVICE, timeSpentMs: 1200 }

describe('SaveAnswerInput', () => {
  it.each([
    ['multiple choice', { selectedOptionId: 'a' }],
    ['short answer', { responseText: 'cleared' }],
    ['dialog fill', { blankAnswers: [{ index: 0, text: 'x' }] }],
    ['ordering', { order: ['a', 'b'] }],
    ['diagram label', { mapping: [{ zoneId: 'z', labelId: 'l' }] }],
  ])('accepts a %s answer', (_name, answer) => {
    expect(SaveAnswerInput.safeParse({ ...base, answer }).success).toBe(true)
  })

  it('rejects an answer mixing two question types', () => {
    const answer = { responseText: 'x', order: ['a', 'b'] }
    expect(SaveAnswerInput.safeParse({ ...base, answer }).success).toBe(false)
  })

  it('rejects a missing time spent', () => {
    const { timeSpentMs: _omit, ...rest } = base
    expect(SaveAnswerInput.safeParse({ ...rest, answer: { selectedOptionId: 'a' } }).success).toBe(
      false,
    )
  })

  it.each([-1, 86_400_001, 1.5])('rejects time spent %s', (timeSpentMs) => {
    const input = { ...base, timeSpentMs, answer: { selectedOptionId: 'a' } }
    expect(SaveAnswerInput.safeParse(input).success).toBe(false)
  })

  it('rejects a missing device id', () => {
    const { deviceId: _omit, ...rest } = base
    expect(SaveAnswerInput.safeParse({ ...rest, answer: { selectedOptionId: 'a' } }).success).toBe(
      false,
    )
  })

  it('rejects an option outside a to d', () => {
    expect(SaveAnswerInput.safeParse({ ...base, answer: { selectedOptionId: 'e' } }).success).toBe(
      false,
    )
  })

  it('rejects an ordering with duplicate ids as strictly as a check does', () => {
    expect(SaveAnswerInput.safeParse({ ...base, answer: { order: ['a', 'a'] } }).success).toBe(
      false,
    )
  })

  it('rejects dialog fill blanks with a duplicate index', () => {
    const blankAnswers = [
      { index: 0, text: 'x' },
      { index: 0, text: 'y' },
    ]
    expect(SaveAnswerInput.safeParse({ ...base, answer: { blankAnswers } }).success).toBe(false)
  })

  it('rejects a diagram mapping reusing a label', () => {
    const mapping = [
      { zoneId: 'z1', labelId: 'l' },
      { zoneId: 'z2', labelId: 'l' },
    ]
    expect(SaveAnswerInput.safeParse({ ...base, answer: { mapping } }).success).toBe(false)
  })

  it('rejects an unrecognised top-level key', () => {
    const input = { ...base, answer: { selectedOptionId: 'a' }, extra: 1 }
    expect(SaveAnswerInput.safeParse(input).success).toBe(false)
  })
})

describe('SavePositionInput', () => {
  const pos = { sessionId: SESSION, deviceId: DEVICE, currentIndex: 3, pinnedQuestionIds: [] }

  it('accepts a position without a leaving pair', () => {
    expect(SavePositionInput.safeParse(pos).success).toBe(true)
  })

  it('accepts a position with a complete leaving pair', () => {
    const leaving = { questionId: QUESTION, timeSpentMs: 500 }
    expect(SavePositionInput.safeParse({ ...pos, leaving }).success).toBe(true)
  })

  it('rejects a leaving pair with only the question id', () => {
    const input = { ...pos, leaving: { questionId: QUESTION } }
    expect(SavePositionInput.safeParse(input).success).toBe(false)
  })

  it('rejects a leaving pair with only the time', () => {
    const input = { ...pos, leaving: { timeSpentMs: 500 } }
    expect(SavePositionInput.safeParse(input).success).toBe(false)
  })

  it.each([-1, 500, 1.5])('rejects current index %s', (currentIndex) => {
    expect(SavePositionInput.safeParse({ ...pos, currentIndex }).success).toBe(false)
  })

  it('rejects more than 500 pins', () => {
    const pinnedQuestionIds = Array.from({ length: 501 }, () => QUESTION)
    expect(SavePositionInput.safeParse({ ...pos, pinnedQuestionIds }).success).toBe(false)
  })

  it('rejects a pin that is not a uuid', () => {
    expect(SavePositionInput.safeParse({ ...pos, pinnedQuestionIds: ['nope'] }).success).toBe(false)
  })
})

describe('ClaimInput', () => {
  it('accepts a session and device id', () => {
    expect(ClaimInput.safeParse({ sessionId: SESSION, deviceId: DEVICE }).success).toBe(true)
  })

  it('rejects a missing device id', () => {
    expect(ClaimInput.safeParse({ sessionId: SESSION }).success).toBe(false)
  })
})
