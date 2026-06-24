import { describe, expect, it, vi } from 'vitest'
import { rowToDraftData } from './load-draft-helpers'

type DraftRow = Parameters<typeof rowToDraftData>[0]

function buildRow(overrides: Record<string, unknown> = {}): DraftRow {
  return {
    id: 'draft-1',
    student_id: 'user-1',
    session_config: { sessionId: 'sess-abc', subjectName: 'Meteorology', subjectCode: 'MET' },
    question_ids: ['q1', 'q2'],
    answers: { q1: { selectedOptionId: 'a', responseTimeMs: 4000 } },
    current_index: 1,
    created_at: '2026-06-24T10:00:00Z',
    updated_at: '2026-06-24T10:05:00Z',
    ...overrides,
  } as unknown as DraftRow
}

describe('rowToDraftData — session_config', () => {
  it('maps a well-formed row to DraftData', () => {
    const draft = rowToDraftData(buildRow())
    expect(draft.sessionId).toBe('sess-abc')
    expect(draft.subjectName).toBe('Meteorology')
    expect(draft.currentIndex).toBe(1)
  })

  it('falls back to an empty sessionId and logs when session_config is malformed', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = rowToDraftData(buildRow({ session_config: null }))
    expect(draft.sessionId).toBe('')
    expect(draft.questionIds).toEqual(['q1', 'q2'])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[rowToDraftData] Malformed session_config on draft',
      'draft-1',
    )
    consoleSpy.mockRestore()
  })

  it('falls back to an empty sessionId and logs when subjectName is not a string', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = rowToDraftData(
      buildRow({ session_config: { sessionId: 'sess-abc', subjectName: 42 } }),
    )
    expect(draft.sessionId).toBe('')
    expect(draft.subjectName).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[rowToDraftData] Malformed session_config on draft',
      'draft-1',
    )
    consoleSpy.mockRestore()
  })
})

describe('rowToDraftData — feedback normalization', () => {
  it('tags legacy untagged MC feedback as multiple_choice', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            isCorrect: true,
            correctOptionId: 'opt-a',
            explanationText: 'why',
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toEqual({
      q1: {
        questionType: 'multiple_choice',
        isCorrect: true,
        correctOptionId: 'opt-a',
        explanationText: 'why',
        explanationImageUrl: null,
      },
    })
  })

  it('preserves already-tagged short_answer and dialog_fill feedback', () => {
    const feedback = {
      q1: {
        questionType: 'short_answer',
        isCorrect: true,
        correctAnswer: 'cleared to land',
        explanationText: null,
        explanationImageUrl: null,
      },
      q2: {
        questionType: 'dialog_fill',
        isCorrect: false,
        blanks: [{ index: 0, isCorrect: true, canonical: 'cleared' }],
        explanationText: null,
        explanationImageUrl: null,
      },
    }
    expect(rowToDraftData(buildRow({ feedback })).feedback).toEqual(feedback)
  })

  it('returns undefined feedback when the column is null', () => {
    expect(rowToDraftData(buildRow({ feedback: null })).feedback).toBeUndefined()
  })

  it('rejects the whole feedback record when any entry is malformed', () => {
    // A short_answer entry missing isCorrect invalidates the record (the strict
    // .every semantics), so no partially-typed feedback leaks through.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: { questionType: 'short_answer', correctAnswer: 'x' },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('drops an MC entry that is missing correctOptionId', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: { q1: { isCorrect: true, explanationText: null, explanationImageUrl: null } },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('drops an MC entry with an empty-string correctOptionId', () => {
    // Symmetry with the sessionStorage rehydrate path, which requires a
    // non-empty correctOptionId — an empty string voids the whole record.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            isCorrect: true,
            correctOptionId: '',
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects the whole feedback record when the column is an array instead of an object', () => {
    // toFeedbackRecord guards Array.isArray(v) — an array is not a valid record.
    const draft = rowToDraftData(buildRow({ feedback: [] }))
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a short_answer entry whose correctAnswer is neither null nor a string', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: { questionType: 'short_answer', isCorrect: true, correctAnswer: 42 },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a dialog_fill entry whose blanks field is not an array', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: { questionType: 'dialog_fill', isCorrect: true, blanks: 'not-an-array' },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a dialog_fill entry whose blank element is malformed', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'dialog_fill',
            isCorrect: true,
            blanks: [{ index: 0, isCorrect: 'no', canonical: 'x' }],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })
})
