import type { FormState } from './build-initial-form-state'

export function buildQuestionPayload(s: FormState, questionId: string | undefined) {
  return {
    ...(questionId ? { id: questionId } : {}),
    subject_id: s.subjectId,
    topic_id: s.topicId,
    subtopic_id: s.subtopicId,
    question_number: s.questionNumber || null,
    lo_reference: s.loReference || null,
    question_text: s.questionText,
    options: s.options,
    correct_option_id: s.correctOptionId,
    explanation_text: s.explanationText,
    question_image_url: s.questionImageUrl || null,
    explanation_image_url: s.explanationImageUrl || null,
    difficulty: s.difficulty,
    status: s.status,
    has_calculations: s.hasCalculations,
  }
}

export function canSubmitQuestion(s: FormState): boolean {
  return (
    !!s.subjectId &&
    !!s.topicId &&
    s.questionText.trim() !== '' &&
    s.options.every((o) => o.text.trim() !== '') &&
    !!s.correctOptionId &&
    s.explanationText.trim() !== ''
  )
}
