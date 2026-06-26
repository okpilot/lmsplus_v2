import { describe, expect, it } from 'vitest'
import { CheckNonMcAnswerSchema } from './check-non-mc-answer-schema'

const QID = '00000000-0000-4000-a000-000000000001'
const SID = '00000000-0000-4000-a000-000000000002'

// ---- CheckNonMcAnswerSchema (client-input guardrail) ------------------------

describe('CheckNonMcAnswerSchema', () => {
  it('accepts a short_answer payload', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        responseText: 'cleared to land',
      }).success,
    ).toBe(true)
  })

  it('accepts a dialog_fill payload', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        blankAnswers: [{ index: 0, text: 'cleared to land' }],
      }).success,
    ).toBe(true)
  })

  it('accepts an ordering payload', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        order: ['item-a', 'item-b', 'item-c'],
      }).success,
    ).toBe(true)
  })

  it('rejects an ordering payload with fewer than two items', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        order: ['item-a'],
      }).success,
    ).toBe(false)
  })

  it('rejects an ordering payload carrying an empty item id', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        order: ['item-a', ''],
      }).success,
    ).toBe(false)
  })

  it('rejects an ordering payload that repeats an item id', () => {
    // An ordering answer is a permutation — a repeated id is not a valid order.
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        order: ['item-a', 'item-b', 'item-a'],
      }).success,
    ).toBe(false)
  })

  it('rejects an ordering payload with more than 50 items', () => {
    const order = Array.from({ length: 51 }, (_, i) => `item-${i}`)
    expect(
      CheckNonMcAnswerSchema.safeParse({ questionId: QID, sessionId: SID, order }).success,
    ).toBe(false)
  })

  it('rejects an ordering payload containing an item id longer than 200 characters', () => {
    const longId = 'a'.repeat(201)
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        order: ['item-a', longId],
      }).success,
    ).toBe(false)
  })

  it('rejects a mixed payload carrying both order and responseText', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        order: ['item-a', 'item-b'],
        responseText: 'cleared to land',
      }).success,
    ).toBe(false)
  })

  it('rejects a mixed payload carrying both responseText and blankAnswers', () => {
    // `.strict()` on both members stops z.union from stripping the extra key and
    // silently grading a hybrid as short_answer.
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        responseText: 'cleared to land',
        blankAnswers: [{ index: 0, text: 'cleared to land' }],
      }).success,
    ).toBe(false)
  })

  it('rejects an empty blankAnswers array', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        blankAnswers: [],
      }).success,
    ).toBe(false)
  })

  it('rejects a payload carrying neither answer field', () => {
    expect(CheckNonMcAnswerSchema.safeParse({ questionId: QID, sessionId: SID }).success).toBe(
      false,
    )
  })

  it('rejects a non-uuid questionId', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: 'not-a-uuid',
        sessionId: SID,
        responseText: 'x',
      }).success,
    ).toBe(false)
  })

  it('rejects duplicate blank indices', () => {
    expect(
      CheckNonMcAnswerSchema.safeParse({
        questionId: QID,
        sessionId: SID,
        blankAnswers: [
          { index: 0, text: 'a' },
          { index: 0, text: 'b' },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects more than the maximum number of blanks', () => {
    const blankAnswers = Array.from({ length: 51 }, (_, i) => ({ index: i, text: 'x' }))
    expect(
      CheckNonMcAnswerSchema.safeParse({ questionId: QID, sessionId: SID, blankAnswers }).success,
    ).toBe(false)
  })
})
