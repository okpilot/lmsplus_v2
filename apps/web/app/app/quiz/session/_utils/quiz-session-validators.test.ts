import { describe, expect, it } from 'vitest'
import { hasValidOptionalFields, isNonEmptyString } from './quiz-session-validators'

// ---- isNonEmptyString -------------------------------------------------------

describe('isNonEmptyString', () => {
  it('returns true for a non-empty string', () => {
    expect(isNonEmptyString('hello')).toBe(true)
  })

  it('returns false for an empty string', () => {
    expect(isNonEmptyString('')).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isNonEmptyString(42)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isNonEmptyString(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isNonEmptyString(undefined)).toBe(false)
  })

  it('returns false for a boolean', () => {
    expect(isNonEmptyString(true)).toBe(false)
  })

  it('returns false for an object', () => {
    expect(isNonEmptyString({})).toBe(false)
  })

  it('returns true for a string containing only whitespace', () => {
    // Whitespace is non-empty (length > 0) — callers decide if they want to trim
    expect(isNonEmptyString('  ')).toBe(true)
  })
})

// ---- hasValidOptionalFields -------------------------------------------------

describe('hasValidOptionalFields', () => {
  const QUESTION_COUNT = 5

  // ---- happy path: absent or undefined fields are always valid ----------------

  it('returns true when no optional fields are present', () => {
    expect(hasValidOptionalFields({}, QUESTION_COUNT)).toBe(true)
  })

  it('returns true when all optional fields are undefined', () => {
    expect(
      hasValidOptionalFields(
        {
          draftAnswers: undefined,
          draftCurrentIndex: undefined,
          draftId: undefined,
          subjectName: undefined,
          subjectCode: undefined,
        },
        QUESTION_COUNT,
      ),
    ).toBe(true)
  })

  // ---- draftAnswers -----------------------------------------------------------

  it('returns true when draftAnswers is a plain object', () => {
    expect(
      hasValidOptionalFields(
        { draftAnswers: { q1: { selectedOptionId: 'a', responseTimeMs: 500 } } },
        QUESTION_COUNT,
      ),
    ).toBe(true)
  })

  it('returns true when draftAnswers is an empty object', () => {
    expect(hasValidOptionalFields({ draftAnswers: {} }, QUESTION_COUNT)).toBe(true)
  })

  it('returns false when draftAnswers is an array', () => {
    expect(hasValidOptionalFields({ draftAnswers: ['bad'] }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftAnswers is a string', () => {
    expect(hasValidOptionalFields({ draftAnswers: 'bad' }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftAnswers is null', () => {
    // null is typeof 'object' but fails the !== null guard
    expect(hasValidOptionalFields({ draftAnswers: null }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftAnswers is a number', () => {
    expect(hasValidOptionalFields({ draftAnswers: 42 }, QUESTION_COUNT)).toBe(false)
  })

  // ---- draftCurrentIndex ------------------------------------------------------

  it('returns true when draftCurrentIndex is 0 (lower boundary)', () => {
    expect(hasValidOptionalFields({ draftCurrentIndex: 0 }, QUESTION_COUNT)).toBe(true)
  })

  it('returns true when draftCurrentIndex is one below questionCount', () => {
    expect(hasValidOptionalFields({ draftCurrentIndex: QUESTION_COUNT - 1 }, QUESTION_COUNT)).toBe(
      true,
    )
  })

  it('returns false when draftCurrentIndex equals questionCount (out of bounds)', () => {
    expect(hasValidOptionalFields({ draftCurrentIndex: QUESTION_COUNT }, QUESTION_COUNT)).toBe(
      false,
    )
  })

  it('returns false when draftCurrentIndex is negative', () => {
    expect(hasValidOptionalFields({ draftCurrentIndex: -1 }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftCurrentIndex is a float', () => {
    expect(hasValidOptionalFields({ draftCurrentIndex: 1.5 }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftCurrentIndex is a string', () => {
    expect(hasValidOptionalFields({ draftCurrentIndex: 'not-a-number' }, QUESTION_COUNT)).toBe(
      false,
    )
  })

  // ---- draftId ----------------------------------------------------------------

  it('returns true when draftId is a non-empty string', () => {
    expect(hasValidOptionalFields({ draftId: 'draft-abc' }, QUESTION_COUNT)).toBe(true)
  })

  it('returns false when draftId is an empty string', () => {
    expect(hasValidOptionalFields({ draftId: '' }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftId is a number', () => {
    expect(hasValidOptionalFields({ draftId: 123 }, QUESTION_COUNT)).toBe(false)
  })

  // ---- subjectName ------------------------------------------------------------

  it('returns true when subjectName is a non-empty string', () => {
    expect(hasValidOptionalFields({ subjectName: 'Meteorology' }, QUESTION_COUNT)).toBe(true)
  })

  it('returns true when subjectName is an empty string (any string is valid)', () => {
    // The type is `typeof value === 'string'` — empty string is still a string
    expect(hasValidOptionalFields({ subjectName: '' }, QUESTION_COUNT)).toBe(true)
  })

  it('returns false when subjectName is a number', () => {
    expect(hasValidOptionalFields({ subjectName: 42 }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when subjectName is a boolean', () => {
    expect(hasValidOptionalFields({ subjectName: true }, QUESTION_COUNT)).toBe(false)
  })

  // ---- subjectCode ------------------------------------------------------------

  it('returns true when subjectCode is a non-empty string', () => {
    expect(hasValidOptionalFields({ subjectCode: 'MET' }, QUESTION_COUNT)).toBe(true)
  })

  it('returns false when subjectCode is a boolean', () => {
    expect(hasValidOptionalFields({ subjectCode: false }, QUESTION_COUNT)).toBe(false)
  })

  // ---- combinations -----------------------------------------------------------

  it('returns true for a fully populated valid record', () => {
    expect(
      hasValidOptionalFields(
        {
          draftAnswers: { q1: { selectedOptionId: 'a', responseTimeMs: 200 } },
          draftCurrentIndex: 2,
          draftId: 'draft-1',
          subjectName: 'Navigation',
          subjectCode: 'NAV',
        },
        QUESTION_COUNT,
      ),
    ).toBe(true)
  })

  it('returns false when a single invalid field fails in an otherwise valid record', () => {
    expect(
      hasValidOptionalFields(
        {
          draftAnswers: {},
          draftCurrentIndex: QUESTION_COUNT, // invalid — equals questionCount
          draftId: 'draft-1',
          subjectName: 'Navigation',
          subjectCode: 'NAV',
        },
        QUESTION_COUNT,
      ),
    ).toBe(false)
  })
})
