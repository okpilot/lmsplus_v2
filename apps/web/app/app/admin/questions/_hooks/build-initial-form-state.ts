import type { QuestionOption, QuestionRow } from '../types'

export type CorrectOptionId = 'a' | 'b' | 'c' | 'd' | ''

export const EMPTY_OPTIONS: QuestionOption[] = [
  { id: 'a', text: '' },
  { id: 'b', text: '' },
  { id: 'c', text: '' },
  { id: 'd', text: '' },
]

/**
 * Maps a question row (or undefined, for the "new question" case) plus the
 * separately-fetched MC answer key into the editor's initial field values.
 * Used both to seed the form's useState calls and to reset it on dialog close.
 */
export function buildInitialFormState(
  question: QuestionRow | undefined,
  initialCorrectOptionId: CorrectOptionId,
) {
  return {
    subjectId: question?.subject_id,
    topicId: question?.topic_id,
    subtopicId: question?.subtopic_id ?? null,
    questionNumber: question?.question_number ?? '',
    loReference: question?.lo_reference ?? '',
    questionText: question?.question_text ?? '',
    options: question?.options ?? EMPTY_OPTIONS,
    correctOptionId: initialCorrectOptionId,
    explanationText: question?.explanation_text ?? '',
    questionImageUrl: question?.question_image_url ?? null,
    explanationImageUrl: question?.explanation_image_url ?? null,
    difficulty: question?.difficulty ?? 'medium',
    status: question?.status ?? 'draft',
    hasCalculations: question?.has_calculations ?? false,
  }
}

export type FormState = ReturnType<typeof buildInitialFormState>

/** A single-field updater bound to one key of the form-state object. */
type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void

/**
 * Exposes per-field `set<Field>` callbacks backed by a single object-state
 * updater, keeping the hook's returned handler surface stable for callers
 * (e.g. `h.setQuestionText(value)`).
 */
export function buildSetterHandlers(setField: SetField) {
  return {
    setSubtopicId: (v: FormState['subtopicId']) => setField('subtopicId', v),
    setQuestionNumber: (v: FormState['questionNumber']) => setField('questionNumber', v),
    setLoReference: (v: FormState['loReference']) => setField('loReference', v),
    setQuestionText: (v: FormState['questionText']) => setField('questionText', v),
    setOptions: (v: FormState['options']) => setField('options', v),
    setCorrectOptionId: (v: FormState['correctOptionId']) => setField('correctOptionId', v),
    setExplanationText: (v: FormState['explanationText']) => setField('explanationText', v),
    setQuestionImageUrl: (v: FormState['questionImageUrl']) => setField('questionImageUrl', v),
    setExplanationImageUrl: (v: FormState['explanationImageUrl']) =>
      setField('explanationImageUrl', v),
    setDifficulty: (v: FormState['difficulty']) => setField('difficulty', v),
    setStatus: (v: FormState['status']) => setField('status', v),
    setHasCalculations: (v: FormState['hasCalculations']) => setField('hasCalculations', v),
  }
}
