import { describe, expect, it } from 'vitest'
import type { DraftAnswer } from '../../types'
import { fanOutAnswer } from './quiz-submit-fanout'

const Q_ID = '00000000-0000-4000-c000-000000000011'

function draft(overrides: Partial<DraftAnswer> = {}): DraftAnswer {
  return { responseTimeMs: 1000, ...overrides }
}

describe('fanOutAnswer — multiple_choice (default)', () => {
  it('fans out a single entry with the selected option id', () => {
    expect(fanOutAnswer(Q_ID, draft({ selectedOptionId: 'opt-a' }))).toEqual([
      { questionId: Q_ID, selectedOptionId: 'opt-a', responseTimeMs: 1000 },
    ])
  })
})

describe('fanOutAnswer — short_answer', () => {
  it('fans out a single entry with the response text', () => {
    expect(fanOutAnswer(Q_ID, draft({ responseText: 'cleared to land' }))).toEqual([
      { questionId: Q_ID, responseText: 'cleared to land', responseTimeMs: 1000 },
    ])
  })
})

describe('fanOutAnswer — dialog_fill', () => {
  it('fans out one entry per blank', () => {
    const result = fanOutAnswer(
      Q_ID,
      draft({
        blankAnswers: [
          { index: 0, text: 'north' },
          { index: 1, text: 'south' },
        ],
      }),
    )
    expect(result).toEqual([
      { questionId: Q_ID, blankIndex: 0, responseText: 'north', responseTimeMs: 1000 },
      { questionId: Q_ID, blankIndex: 1, responseText: 'south', responseTimeMs: 1000 },
    ])
  })
})

describe('fanOutAnswer — ordering', () => {
  it('fans out one entry per slot with the item id and slot position', () => {
    const result = fanOutAnswer(Q_ID, draft({ order: ['item-c', 'item-a', 'item-b'] }))
    expect(result).toEqual([
      { questionId: Q_ID, selectedOptionId: 'item-c', blankIndex: 0, responseTimeMs: 1000 },
      { questionId: Q_ID, selectedOptionId: 'item-a', blankIndex: 1, responseTimeMs: 1000 },
      { questionId: Q_ID, selectedOptionId: 'item-b', blankIndex: 2, responseTimeMs: 1000 },
    ])
  })

  it('emits no rows for an empty order', () => {
    // The Array.isArray(a.order) branch routes ordering BEFORE the MC default, so an
    // empty order must NOT produce a bogus `{ selectedOptionId: undefined }` row.
    expect(fanOutAnswer(Q_ID, draft({ order: [] }))).toEqual([])
  })
})

describe('fanOutAnswer — diagram_label', () => {
  it('fans out one entry per placed zone with the label id in selectedOptionId and the zone id in responseText', () => {
    // INVERTED vs intuition (documented at the call site): the label id rides in
    // selectedOptionId, the zone id rides in responseText.
    const result = fanOutAnswer(
      Q_ID,
      draft({
        mapping: [
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ],
      }),
    )
    expect(result).toEqual([
      {
        questionId: Q_ID,
        selectedOptionId: 'l1',
        responseText: 'z1',
        blankIndex: 0,
        responseTimeMs: 1000,
      },
      {
        questionId: Q_ID,
        selectedOptionId: 'l2',
        responseText: 'z2',
        blankIndex: 1,
        responseTimeMs: 1000,
      },
    ])
  })

  it('assigns each entry a distinct blankIndex even though it does not represent a true zone ordinal', () => {
    const result = fanOutAnswer(
      Q_ID,
      draft({
        mapping: [
          { zoneId: 'z9', labelId: 'l9' },
          { zoneId: 'z1', labelId: 'l1' },
        ],
      }),
    )
    const indices = result.map((r) => r.blankIndex)
    expect(new Set(indices).size).toBe(indices.length)
  })

  it('emits one entry for a partial submission (not every zone placed)', () => {
    const result = fanOutAnswer(Q_ID, draft({ mapping: [{ zoneId: 'z1', labelId: 'l1' }] }))
    expect(result).toEqual([
      {
        questionId: Q_ID,
        selectedOptionId: 'l1',
        responseText: 'z1',
        blankIndex: 0,
        responseTimeMs: 1000,
      },
    ])
  })

  it('emits no rows for an empty mapping', () => {
    // Mirrors the ordering empty-array guard: a diagram_label answer with nothing
    // placed must not fall through to the MC default and emit a bogus row.
    expect(fanOutAnswer(Q_ID, draft({ mapping: [] }))).toEqual([])
  })
})
