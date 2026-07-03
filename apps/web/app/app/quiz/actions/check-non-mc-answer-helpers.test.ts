import { describe, expect, it } from 'vitest'
import {
  isDiagramRpcResult,
  isDialogFillRpcResult,
  isOrderingRpcResult,
  isShortAnswerRpcResult,
  toClientBlanks,
  toRpcBlankAnswers,
} from './check-non-mc-answer-helpers'
import { MAX_ZONES } from './diagram-validation'

// ---- isShortAnswerRpcResult -------------------------------------------------

describe('isShortAnswerRpcResult', () => {
  it('accepts a well-formed short_answer RPC row', () => {
    expect(
      isShortAnswerRpcResult({
        is_correct: true,
        correct_answer: 'cleared to land',
        blanks: null,
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(true)
  })

  it('accepts when correct_answer is null', () => {
    expect(
      isShortAnswerRpcResult({
        is_correct: false,
        correct_answer: null,
        blanks: null,
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(true)
  })

  it('accepts when explanation fields are strings', () => {
    expect(
      isShortAnswerRpcResult({
        is_correct: true,
        correct_answer: 'ok',
        blanks: null,
        explanation_text: 'Because lift.',
        explanation_image_url: 'https://example.com/img.png',
      }),
    ).toBe(true)
  })

  it('rejects when blanks is an array (dialog_fill shape)', () => {
    expect(
      isShortAnswerRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: 0, is_correct: true, canonical: 'x' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when is_correct is missing', () => {
    expect(
      isShortAnswerRpcResult({
        correct_answer: 'x',
        blanks: null,
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when is_correct is not a boolean', () => {
    expect(
      isShortAnswerRpcResult({
        is_correct: 'yes',
        correct_answer: 'x',
        blanks: null,
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects null input', () => {
    expect(isShortAnswerRpcResult(null)).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(isShortAnswerRpcResult('string')).toBe(false)
    expect(isShortAnswerRpcResult(42)).toBe(false)
  })
})

// ---- isDialogFillRpcResult --------------------------------------------------

describe('isDialogFillRpcResult', () => {
  it('accepts a well-formed dialog_fill RPC row', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: false,
        correct_answer: null,
        blanks: [
          { index: 0, is_correct: true, canonical: 'alpha' },
          { index: 1, is_correct: false, canonical: '27' },
        ],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(true)
  })

  it('rejects an empty blanks array', () => {
    // A dialog_fill always has ≥1 blank; an empty array is a malformed result.
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when correct_answer is not null', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: 'some value',
        blanks: [],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when blanks is null (short_answer shape)', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a blank row is missing is_correct', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: 0, canonical: 'x' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a blank row has non-string canonical', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: 0, is_correct: true, canonical: 42 }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a blank row has non-number index', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: 'zero', is_correct: true, canonical: 'x' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a blank row has a fractional index', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: 1.5, is_correct: true, canonical: 'x' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a blank row has a negative index', () => {
    expect(
      isDialogFillRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: -1, is_correct: true, canonical: 'x' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects null input', () => {
    expect(isDialogFillRpcResult(null)).toBe(false)
  })
})

// ---- isOrderingRpcResult ----------------------------------------------------

describe('isOrderingRpcResult', () => {
  it('accepts a well-formed ordering RPC row', () => {
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: ['MAYDAY', 'callsign', 'distress'],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(true)
  })

  it('rejects an empty correct_order array', () => {
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: [],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects a single-item correct_order', () => {
    // An ordering canonical order is ≥2 items (the CHECK enforces it); a one-item
    // correct_order is corrupt RPC data — fail closed rather than grade against it.
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: ['only-step'],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects a correct_order longer than fifty items', () => {
    // Upper-bound parity with the submit + draft validators (all `.max(50)`); the
    // canonical item count is DB-bounded, so >50 is corrupt RPC data.
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: Array.from({ length: 51 }, (_, i) => `item-${i}`),
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when correct_order contains a non-string entry', () => {
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: ['a', 42],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when correct_order contains a whitespace-only entry', () => {
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: ['MAYDAY', '   ', 'distress'],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when correct_order repeats an id', () => {
    // A canonical order is a permutation — a duplicate id is a malformed RPC result.
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: ['a', 'b', 'a'],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when blanks is an array (dialog_fill shape)', () => {
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: 0, is_correct: true, canonical: 'x' }],
        correct_order: ['a', 'b'],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when correct_answer is not null', () => {
    expect(
      isOrderingRpcResult({
        is_correct: true,
        correct_answer: 'leak',
        blanks: null,
        correct_order: ['a', 'b'],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects null input', () => {
    expect(isOrderingRpcResult(null)).toBe(false)
  })
})

// ---- isDiagramRpcResult -----------------------------------------------------

describe('isDiagramRpcResult', () => {
  it('accepts a well-formed diagram_label RPC row', () => {
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: [
          { zone_id: 'z1', label_id: 'l1' },
          { zone_id: 'z2', label_id: 'l2' },
        ],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(true)
  })

  it('rejects an empty correct_mapping array', () => {
    // A diagram question always has ≥1 zone (mig 150 CHECK), so an empty
    // correct_mapping is malformed RPC data — reject it rather than grade against it.
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: [],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects a correct_mapping longer than MAX_ZONES', () => {
    const tooMany = Array.from({ length: MAX_ZONES + 1 }, (_, i) => ({
      zone_id: `z${i}`,
      label_id: `l${i}`,
    }))
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: tooMany,
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a correct_mapping element has a blank label_id', () => {
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: [{ zone_id: 'z1', label_id: '' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a correct_mapping element has a whitespace-only zone_id', () => {
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: [{ zone_id: '   ', label_id: 'l1' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when a correct_mapping element has a whitespace-only label_id', () => {
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: [{ zone_id: 'z1', label_id: '   ' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when correct_mapping is not an array (dialog_fill shape)', () => {
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: 'not-an-array',
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when blanks is an array (dialog_fill shape)', () => {
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: null,
        blanks: [{ index: 0, is_correct: true, canonical: 'x' }],
        correct_mapping: [{ zone_id: 'z1', label_id: 'l1' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects when correct_answer is not null', () => {
    expect(
      isDiagramRpcResult({
        is_correct: true,
        correct_answer: 'leak',
        blanks: null,
        correct_mapping: [{ zone_id: 'z1', label_id: 'l1' }],
        explanation_text: null,
        explanation_image_url: null,
      }),
    ).toBe(false)
  })

  it('rejects null input', () => {
    expect(isDiagramRpcResult(null)).toBe(false)
  })
})

// ---- toRpcBlankAnswers ------------------------------------------------------

describe('toRpcBlankAnswers', () => {
  it('converts client blank answers to the RPC request shape', () => {
    const result = toRpcBlankAnswers([
      { index: 0, text: 'alpha' },
      { index: 1, text: 'bravo' },
    ])
    expect(result).toEqual([
      { blank_index: 0, response_text: 'alpha' },
      { blank_index: 1, response_text: 'bravo' },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(toRpcBlankAnswers([])).toEqual([])
  })

  it('preserves index values for non-sequential indices', () => {
    const result = toRpcBlankAnswers([{ index: 3, text: 'delta' }])
    expect(result[0]?.blank_index).toBe(3)
    expect(result[0]?.response_text).toBe('delta')
  })
})

// ---- toClientBlanks ---------------------------------------------------------

describe('toClientBlanks', () => {
  it('returns per-blank results in the client shape with camelCase correctness', () => {
    const result = toClientBlanks([
      { index: 0, is_correct: true, canonical: 'alpha' },
      { index: 1, is_correct: false, canonical: '27' },
    ])
    expect(result).toEqual([
      { index: 0, isCorrect: true, canonical: 'alpha' },
      { index: 1, isCorrect: false, canonical: '27' },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(toClientBlanks([])).toEqual([])
  })

  it('preserves non-sequential indices', () => {
    const result = toClientBlanks([{ index: 5, is_correct: false, canonical: 'echo' }])
    expect(result[0]?.index).toBe(5)
    expect(result[0]?.isCorrect).toBe(false)
    expect(result[0]?.canonical).toBe('echo')
  })
})
