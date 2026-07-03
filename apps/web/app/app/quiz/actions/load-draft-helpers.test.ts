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

describe('rowToDraftData — answers normalization', () => {
  it('preserves a well-formed answers record', () => {
    const answers = { q1: { selectedOptionId: 'opt-a', responseTimeMs: 4000 } }
    const draft = rowToDraftData(buildRow({ answers }))
    expect(draft.answers).toEqual(answers)
  })

  it('returns an empty answers object and logs when the answers column is not an object', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = rowToDraftData(buildRow({ answers: 'not-an-object' }))
    expect(draft.answers).toEqual({})
    expect(consoleSpy).toHaveBeenCalledWith(
      '[toDraftAnswerRecord] Malformed answers value on draft',
      'draft-1',
    )
    consoleSpy.mockRestore()
  })

  it('returns an empty answers object and logs when the answers column is null', () => {
    // typeof null === 'object', so the null check is a distinct branch from the
    // non-object check — realistic: the JSONB column can be null in the DB.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = rowToDraftData(buildRow({ answers: null }))
    expect(draft.answers).toEqual({})
    expect(consoleSpy).toHaveBeenCalledWith(
      '[toDraftAnswerRecord] Malformed answers value on draft',
      'draft-1',
    )
    consoleSpy.mockRestore()
  })

  it('returns an empty answers object and logs when the answers column is an array', () => {
    // Array.isArray is a distinct branch: typeof [] === 'object', so it passes the
    // non-object check; only the isArray guard catches it.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = rowToDraftData(buildRow({ answers: ['opt-a'] }))
    expect(draft.answers).toEqual({})
    expect(consoleSpy).toHaveBeenCalledWith(
      '[toDraftAnswerRecord] Malformed answers value on draft',
      'draft-1',
    )
    consoleSpy.mockRestore()
  })

  it('skips a malformed entry and preserves the valid sibling answers', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const draft = rowToDraftData(
      buildRow({
        answers: {
          q1: { selectedOptionId: 'opt-a', responseTimeMs: 4000 },
          q2: { responseTimeMs: 4000 }, // missing an answer payload — malformed
        },
      }),
    )
    // The valid answer survives; only the corrupt entry is dropped — a single bad
    // row must not wipe the student's saved work on resume.
    expect(draft.answers).toEqual({ q1: { selectedOptionId: 'opt-a', responseTimeMs: 4000 } })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[toDraftAnswerRecord] Skipping malformed answer entry on draft',
      'draft-1',
      'q2',
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

  it('preserves already-tagged ordering feedback on resume', () => {
    // Sibling-validator parity with the sessionStorage rehydrate + save paths:
    // a draft carrying ordering feedback must round-trip, not be silently dropped.
    const feedback = {
      q1: {
        questionType: 'ordering',
        isCorrect: false,
        correctOrder: ['MAYDAY MAYDAY MAYDAY', 'callsign and position', 'nature of emergency'],
        explanationText: null,
        explanationImageUrl: null,
      },
    }
    expect(rowToDraftData(buildRow({ feedback })).feedback).toEqual(feedback)
  })

  it('rejects an ordering entry whose correctOrder array is empty', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: true,
            correctOrder: [],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects an ordering entry with a non-string element in correctOrder', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: true,
            correctOrder: ['step one', 42],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects an ordering entry whose correctOrder contains an empty string', () => {
    // Sibling-validator parity: toFeedbackEntry's ordering branch checks
    // s.length > 0 on every element, matching isValidFeedbackEntry in
    // quiz-session-validators.ts. An empty string is distinct from a non-string
    // and must be rejected by its own guard.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: false,
            correctOrder: ['MAYDAY', ''],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects an ordering entry whose correctOrder contains a whitespace-only string', () => {
    // Trim-reject parity with the sessionStorage rehydrate path (isNonBlankString)
    // and the save schema (.trim().min(1)) — a whitespace-only id is corrupt data.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: false,
            correctOrder: ['MAYDAY', '   '],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects an ordering entry whose correctOrder exceeds fifty items', () => {
    // Upper-bound parity (.max(50)) with the save schema, the RPC guard, and the
    // sessionStorage rehydrate path — a tampered DB draft with >50 ids is voided on load.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: true,
            correctOrder: Array.from({ length: 51 }, (_, i) => `step-${i}`),
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('preserves ordering feedback with exactly fifty items in correctOrder (upper boundary)', () => {
    // 50 is the inclusive upper bound — the 51-item rejection test alone does not
    // prove the bound is <= 50 rather than < 50. This pins the inclusive edge.
    const correctOrder = Array.from({ length: 50 }, (_, i) => `step-${i}`)
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: true,
            correctOrder,
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback?.q1).toMatchObject({ questionType: 'ordering', correctOrder })
  })

  it('rejects an ordering entry whose correctOrder has only one item', () => {
    // Four-way parity: min-2 guard in isValidFeedbackEntry (sessionStorage rehydrate),
    // the save schema (draft-schema .min(2)), the RPC guard, and toFeedbackEntry here.
    // A single-item correctOrder is corrupt data — voided on load so resume is clean.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: true,
            correctOrder: ['only-step'],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects an ordering entry whose correctOrder repeats an id', () => {
    // A canonical order is a permutation — a duplicate id is corrupt data, voided on
    // load (parity with isValidFeedbackEntry rehydrate, the RPC guard, and the save schema).
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'ordering',
            isCorrect: true,
            correctOrder: ['step-a', 'step-b', 'step-a'],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
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

  it('preserves already-tagged diagram_label feedback on resume', () => {
    // Sibling-validator parity with the sessionStorage rehydrate + save paths:
    // a draft carrying diagram_label feedback must round-trip, not be silently dropped.
    const feedback = {
      q1: {
        questionType: 'diagram_label',
        isCorrect: false,
        correctMapping: [
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ],
        explanationText: null,
        explanationImageUrl: null,
      },
    }
    expect(rowToDraftData(buildRow({ feedback })).feedback).toEqual(feedback)
  })

  it('rejects a diagram_label entry whose correctMapping array is empty', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'diagram_label',
            isCorrect: true,
            correctMapping: [],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a diagram_label entry whose correctMapping is missing', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'diagram_label',
            isCorrect: true,
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a diagram_label entry whose correctMapping repeats a zoneId', () => {
    // isValidDiagramMapping's array-level self-defence: a zone can be placed at
    // most once in the canonical mapping — a duplicate zoneId is corrupt data.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'diagram_label',
            isCorrect: true,
            correctMapping: [
              { zoneId: 'z1', labelId: 'l1' },
              { zoneId: 'z1', labelId: 'l2' },
            ],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a diagram_label entry whose correctMapping reuses a labelId', () => {
    // A chip is consumed on placement — it cannot occupy two zones simultaneously.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'diagram_label',
            isCorrect: true,
            correctMapping: [
              { zoneId: 'z1', labelId: 'l1' },
              { zoneId: 'z2', labelId: 'l1' },
            ],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a diagram_label entry whose correctMapping element has a blank labelId', () => {
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'diagram_label',
            isCorrect: true,
            correctMapping: [{ zoneId: 'z1', labelId: '' }],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('rejects a diagram_label entry whose correctMapping exceeds MAX_ZONES', () => {
    // Upper-bound parity with the save schema and RPC guard (.max(MAX_ZONES)) — a
    // tampered DB draft with too many zones is corrupt, voided on load.
    const correctMapping = Array.from({ length: 51 }, (_, i) => ({
      zoneId: `z${i}`,
      labelId: `l${i}`,
    }))
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'diagram_label',
            isCorrect: true,
            correctMapping,
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })

  it('preserves diagram_label feedback with exactly fifty items in correctMapping (upper boundary)', () => {
    // 50 is the inclusive upper bound (MAX_ZONES) — the 51-item rejection test alone
    // does not prove the bound is <= 50 rather than < 50. This pins the inclusive edge.
    const correctMapping = Array.from({ length: 50 }, (_, i) => ({
      zoneId: `z${i}`,
      labelId: `l${i}`,
    }))
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'diagram_label',
            isCorrect: true,
            correctMapping,
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback?.q1).toMatchObject({ questionType: 'diagram_label', correctMapping })
  })

  it('rejects a dialog_fill entry whose blanks array is empty', () => {
    // A dialog_fill always grades ≥1 blank, so an empty array on a legacy/persisted
    // row is corrupt — voided here just as the rehydrate validator and save schema do.
    const draft = rowToDraftData(
      buildRow({
        feedback: {
          q1: {
            questionType: 'dialog_fill',
            isCorrect: true,
            blanks: [],
            explanationText: null,
            explanationImageUrl: null,
          },
        },
      }),
    )
    expect(draft.feedback).toBeUndefined()
  })
})
