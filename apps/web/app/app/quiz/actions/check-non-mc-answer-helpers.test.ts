import { describe, expect, it } from 'vitest'
import {
  CheckNonMcAnswerSchema,
  isDialogFillRpcResult,
  isShortAnswerRpcResult,
  toClientBlanks,
  toRpcBlankAnswers,
} from './check-non-mc-answer-helpers'

const QID = '00000000-0000-4000-a000-000000000001'
const SID = '00000000-0000-4000-a000-000000000002'

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
