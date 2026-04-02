import { describe, expect, it } from 'vitest'
import {
  hasValidOptionalFields,
  isNonEmptyString,
  isValidDraftAnswer,
  isValidFeedbackEntry,
  isValidRecordOf,
} from './quiz-session-validators'

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
    expect(isNonEmptyString('  ')).toBe(true)
  })
})
describe('isValidDraftAnswer', () => {
  it('returns true for a well-formed draft answer', () => {
    expect(isValidDraftAnswer({ selectedOptionId: 'opt-a', responseTimeMs: 1200 })).toBe(true)
  })

  it('returns true when responseTimeMs is 0', () => {
    expect(isValidDraftAnswer({ selectedOptionId: 'opt-b', responseTimeMs: 0 })).toBe(true)
  })

  it('returns false when selectedOptionId is missing', () => {
    expect(isValidDraftAnswer({ responseTimeMs: 500 })).toBe(false)
  })

  it('returns false when responseTimeMs is missing', () => {
    expect(isValidDraftAnswer({ selectedOptionId: 'opt-a' })).toBe(false)
  })

  it('returns false when selectedOptionId is a number', () => {
    expect(isValidDraftAnswer({ selectedOptionId: 42, responseTimeMs: 500 })).toBe(false)
  })

  it('returns false when responseTimeMs is a string', () => {
    expect(isValidDraftAnswer({ selectedOptionId: 'opt-a', responseTimeMs: 'fast' })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidDraftAnswer(null)).toBe(false)
  })

  it('returns false for a non-object primitive', () => {
    expect(isValidDraftAnswer('opt-a')).toBe(false)
  })

  it('returns false for an array', () => {
    expect(isValidDraftAnswer(['opt-a', 500])).toBe(false)
  })
})

describe('isValidFeedbackEntry', () => {
  const validEntry = {
    isCorrect: true,
    correctOptionId: 'opt-a',
    explanationText: 'Because lift.',
    explanationImageUrl: null,
  }

  it('returns true for a well-formed feedback entry', () => {
    expect(isValidFeedbackEntry(validEntry)).toBe(true)
  })

  it('returns true when explanationText is null', () => {
    expect(isValidFeedbackEntry({ ...validEntry, explanationText: null })).toBe(true)
  })

  it('returns true when explanationImageUrl is a string URL', () => {
    expect(
      isValidFeedbackEntry({ ...validEntry, explanationImageUrl: 'https://example.com/img.png' }),
    ).toBe(true)
  })

  it('returns true when isCorrect is false', () => {
    expect(isValidFeedbackEntry({ ...validEntry, isCorrect: false })).toBe(true)
  })

  it('returns false when isCorrect is missing', () => {
    const { isCorrect: _, ...rest } = validEntry
    expect(isValidFeedbackEntry(rest)).toBe(false)
  })

  it('returns false when correctOptionId is missing', () => {
    const { correctOptionId: _, ...rest } = validEntry
    expect(isValidFeedbackEntry(rest)).toBe(false)
  })

  it('returns false when isCorrect is a string', () => {
    expect(isValidFeedbackEntry({ ...validEntry, isCorrect: 'yes' })).toBe(false)
  })

  it('returns false when correctOptionId is a number', () => {
    expect(isValidFeedbackEntry({ ...validEntry, correctOptionId: 1 })).toBe(false)
  })

  it('returns false when correctOptionId is an empty string', () => {
    expect(isValidFeedbackEntry({ ...validEntry, correctOptionId: '' })).toBe(false)
  })

  it('returns false when explanationText is a number', () => {
    expect(isValidFeedbackEntry({ ...validEntry, explanationText: 42 })).toBe(false)
  })

  it('returns false when explanationImageUrl is a number', () => {
    expect(isValidFeedbackEntry({ ...validEntry, explanationImageUrl: 99 })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidFeedbackEntry(null)).toBe(false)
  })

  it('returns false for a non-object primitive', () => {
    expect(isValidFeedbackEntry('feedback')).toBe(false)
  })
})

describe('isValidRecordOf', () => {
  const alwaysTrue = () => true
  const alwaysFalse = () => false

  it('returns true for an empty object (vacuously valid)', () => {
    expect(isValidRecordOf({}, alwaysTrue)).toBe(true)
  })

  it('returns true when all entries pass the check', () => {
    expect(
      isValidRecordOf(
        {
          q1: { selectedOptionId: 'opt-a', responseTimeMs: 500 },
          q2: { selectedOptionId: 'opt-b', responseTimeMs: 200 },
        },
        isValidDraftAnswer,
      ),
    ).toBe(true)
  })

  it('returns false when one entry fails the check', () => {
    expect(
      isValidRecordOf(
        {
          q1: { selectedOptionId: 'opt-a', responseTimeMs: 500 },
          q2: { responseTimeMs: 200 }, // missing selectedOptionId
        },
        isValidDraftAnswer,
      ),
    ).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidRecordOf(null, alwaysTrue)).toBe(false)
  })

  it('returns false for an array', () => {
    expect(isValidRecordOf(['a', 'b'], alwaysTrue)).toBe(false)
  })

  it('returns false for a non-object primitive', () => {
    expect(isValidRecordOf('not-an-object', alwaysTrue)).toBe(false)
  })

  it('returns false when all entries would pass but alwaysFalse check is used', () => {
    expect(isValidRecordOf({ q1: {} }, alwaysFalse)).toBe(false)
  })
})

describe('hasValidOptionalFields', () => {
  const QUESTION_COUNT = 5

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
    expect(hasValidOptionalFields({ draftAnswers: null }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftAnswers is a number', () => {
    expect(hasValidOptionalFields({ draftAnswers: 42 }, QUESTION_COUNT)).toBe(false)
  })

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

  it('returns true when draftId is a non-empty string', () => {
    expect(hasValidOptionalFields({ draftId: 'draft-abc' }, QUESTION_COUNT)).toBe(true)
  })

  it('returns false when draftId is an empty string', () => {
    expect(hasValidOptionalFields({ draftId: '' }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftId is a number', () => {
    expect(hasValidOptionalFields({ draftId: 123 }, QUESTION_COUNT)).toBe(false)
  })

  it('returns true when subjectName is a non-empty string', () => {
    expect(hasValidOptionalFields({ subjectName: 'Meteorology' }, QUESTION_COUNT)).toBe(true)
  })

  it('returns true when subjectName is an empty string (any string is valid)', () => {
    expect(hasValidOptionalFields({ subjectName: '' }, QUESTION_COUNT)).toBe(true)
  })

  it('returns false when subjectName is a number', () => {
    expect(hasValidOptionalFields({ subjectName: 42 }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when subjectName is a boolean', () => {
    expect(hasValidOptionalFields({ subjectName: true }, QUESTION_COUNT)).toBe(false)
  })

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

  // ---- draftAnswers entry-level shape validation ---------------------------

  it('returns false when a draftAnswers entry is missing selectedOptionId', () => {
    expect(
      hasValidOptionalFields({ draftAnswers: { q1: { responseTimeMs: 500 } } }, QUESTION_COUNT),
    ).toBe(false)
  })

  it('returns false when a draftAnswers entry has responseTimeMs as a string', () => {
    expect(
      hasValidOptionalFields(
        { draftAnswers: { q1: { selectedOptionId: 'opt-a', responseTimeMs: 'fast' } } },
        QUESTION_COUNT,
      ),
    ).toBe(false)
  })

  it('returns false when a draftAnswers entry is null', () => {
    expect(hasValidOptionalFields({ draftAnswers: { q1: null } }, QUESTION_COUNT)).toBe(false)
  })

  it('returns true when all draftAnswers entries are well-formed', () => {
    expect(
      hasValidOptionalFields(
        {
          draftAnswers: {
            q1: { selectedOptionId: 'opt-a', responseTimeMs: 500 },
            q2: { selectedOptionId: 'opt-b', responseTimeMs: 300 },
          },
        },
        QUESTION_COUNT,
      ),
    ).toBe(true)
  })

  // ---- draftFeedback validation --------------------------------------------

  it('returns true when draftFeedback is absent', () => {
    expect(hasValidOptionalFields({}, QUESTION_COUNT)).toBe(true)
  })

  it('returns true when draftFeedback is undefined', () => {
    expect(hasValidOptionalFields({ draftFeedback: undefined }, QUESTION_COUNT)).toBe(true)
  })

  it('returns true when draftFeedback is an empty object', () => {
    expect(hasValidOptionalFields({ draftFeedback: {} }, QUESTION_COUNT)).toBe(true)
  })

  it('returns true when draftFeedback contains valid feedback entries', () => {
    expect(
      hasValidOptionalFields(
        {
          draftFeedback: {
            q1: {
              isCorrect: true,
              correctOptionId: 'opt-a',
              explanationText: 'Correct.',
              explanationImageUrl: null,
            },
          },
        },
        QUESTION_COUNT,
      ),
    ).toBe(true)
  })

  it('returns true when draftFeedback entries have null explanationText', () => {
    expect(
      hasValidOptionalFields(
        {
          draftFeedback: {
            q1: {
              isCorrect: false,
              correctOptionId: 'opt-b',
              explanationText: null,
              explanationImageUrl: null,
            },
          },
        },
        QUESTION_COUNT,
      ),
    ).toBe(true)
  })

  it('returns false when draftFeedback is an array', () => {
    expect(hasValidOptionalFields({ draftFeedback: ['bad'] }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when draftFeedback is a string', () => {
    expect(hasValidOptionalFields({ draftFeedback: 'bad' }, QUESTION_COUNT)).toBe(false)
  })

  it('returns false when a draftFeedback entry is missing isCorrect', () => {
    expect(
      hasValidOptionalFields(
        {
          draftFeedback: {
            q1: {
              correctOptionId: 'opt-a',
              explanationText: null,
              explanationImageUrl: null,
            },
          },
        },
        QUESTION_COUNT,
      ),
    ).toBe(false)
  })

  it('returns false when a draftFeedback entry has isCorrect as a string', () => {
    expect(
      hasValidOptionalFields(
        {
          draftFeedback: {
            q1: {
              isCorrect: 'yes',
              correctOptionId: 'opt-a',
              explanationText: null,
              explanationImageUrl: null,
            },
          },
        },
        QUESTION_COUNT,
      ),
    ).toBe(false)
  })
})
