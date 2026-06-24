import type {
  DialogFillBlankResult,
  QuizReportQuestion,
  QuizReportQuestionCommon,
} from './quiz-report'

export type AnswerRow = {
  question_id: string
  // Nullable since mig 095: VFR RT text-answer rows store response_text with selected_option_id NULL.
  selected_option_id: string | null
  is_correct: boolean
  response_time_ms: number
  // Non-MC fields (Phase 4). response_text carries the student's typed answer
  // (short_answer = the whole answer; dialog_fill = one blank's answer).
  response_text?: string | null
  // Per-blank index for dialog_fill rows; null/absent for MC and short_answer.
  blank_index?: number | null
}

export type QuestionRow = {
  id: string
  question_text: string
  question_number: string | null
  options: { id: string; text: string }[]
  explanation_text: string | null
  explanation_image_url: string | null
  question_image_url: string | null
  // Discriminator (mig 094, on `questions`). Null/absent on the admin MC-only
  // feed (which omits the column) → defaulted to 'multiple_choice'.
  question_type?: string | null
}

// Per-question answer-key payload from get_report_answer_keys.
//  - short_answer: a single canonical string (canonical).
//  - dialog_fill:  a Map from blank index → canonical string.
//  - MC questions are absent (their key comes from get_report_correct_options).
export type AnswerKeyEntry =
  | { type: 'short_answer'; canonical: string | null }
  | { type: 'dialog_fill'; canonicalByIndex: Map<number, string> }

// Group answer rows by question_id, preserving first-seen order. Returns the
// per-question row groups plus the first-seen order array.
function groupAnswersByQuestion(answers: AnswerRow[]): {
  grouped: Map<string, AnswerRow[]>
  order: string[]
} {
  const order: string[] = []
  const grouped = new Map<string, AnswerRow[]>()
  for (const answer of answers) {
    const existing = grouped.get(answer.question_id)
    if (existing) {
      existing.push(answer)
    } else {
      grouped.set(answer.question_id, [answer])
      order.push(answer.question_id)
    }
  }
  return { grouped, order }
}

/**
 * Group the session's answer rows by question and project each into the
 * discriminated QuizReportQuestion variant. ONE report entry per question:
 *  - multiple_choice / short_answer: a single answer row.
 *  - dialog_fill: N rows (one per blank) collapsed into a single entry with
 *    a per-blank results array sorted by blank_index ascending.
 *
 * A row with no question_type defaults to 'multiple_choice' (the admin MC-only
 * feed relies on this). Questions with zero answer rows do not appear — by
 * design; the summary's Skipped count conveys them.
 */
export function buildReportQuestions(
  answers: AnswerRow[],
  questionMap: Map<string, QuestionRow>,
  correctMap: Map<string, string>,
  answerKeyMap: Map<string, AnswerKeyEntry> = new Map(),
): QuizReportQuestion[] {
  const { grouped, order } = groupAnswersByQuestion(answers)

  return order.map((questionId) => {
    const rows = grouped.get(questionId) ?? []
    const question = questionMap.get(questionId)
    // Discriminate on the question's type (mig 094). The admin MC-only feed
    // omits the column, so absent → 'multiple_choice'.
    const type = question?.question_type ?? 'multiple_choice'

    const common: QuizReportQuestionCommon = {
      questionId,
      questionText: question?.question_text ?? '',
      questionNumber: question?.question_number ?? null,
      explanationText: question?.explanation_text ?? null,
      explanationImageUrl: question?.explanation_image_url ?? null,
      questionImageUrl: question?.question_image_url ?? null,
      // dialog_fill rows share one response time per blank; take the first row's.
      responseTimeMs: rows[0]?.response_time_ms ?? 0,
    }

    if (type === 'short_answer') {
      const row = rows[0]
      const key = answerKeyMap.get(questionId)
      return {
        ...common,
        questionType: 'short_answer' as const,
        isCorrect: row?.is_correct ?? false,
        responseText: row?.response_text ?? null,
        canonicalAnswer: key?.type === 'short_answer' ? key.canonical : null,
      }
    }

    if (type === 'dialog_fill') {
      return buildDialogFill(common, rows, answerKeyMap.get(questionId))
    }

    // multiple_choice (default)
    const row = rows[0]
    const options = question?.options ?? []
    return {
      ...common,
      questionType: 'multiple_choice' as const,
      isCorrect: row?.is_correct ?? false,
      selectedOptionId: row?.selected_option_id ?? null,
      correctOptionId: correctMap.get(questionId) ?? '',
      options: options.map((o) => ({ id: o.id, text: o.text })),
    }
  })
}

function buildDialogFill(
  common: QuizReportQuestionCommon,
  rows: AnswerRow[],
  key: AnswerKeyEntry | undefined,
): QuizReportQuestion {
  const canonicalByIndex =
    key?.type === 'dialog_fill' ? key.canonicalByIndex : new Map<number, string>()
  const rowByIndex = new Map(rows.map((r) => [r.blank_index ?? 0, r]))
  // Drive the blank set from the question's full config — get_report_answer_keys
  // (mig 133) returns every blanks_config entry — so an omitted blank still renders
  // as unanswered (responseText null, isCorrect false). This matches batch_submit_quiz
  // (mig 132), which scores dialog questions against the config's total_blanks, NOT the
  // submitted-row count; building from rows alone would show "2/2" for a 2-of-3 dialog
  // and wrongly flip isCorrect to true. Fall back to the submitted rows only when no
  // answer keys are present (all-MC session, or a keyless race) — preserves prior behavior.
  // Staleness boundary: if blanks_config is edited AFTER the student answered, this follows
  // the CURRENT config while the stored score reflects the answer-time config, so a submitted
  // answer to a since-removed blank is dropped here. Live config edits to answered dialog
  // questions are not a supported flow (same answer-time-vs-current skew the score already has).
  const indices =
    canonicalByIndex.size > 0
      ? [...canonicalByIndex.keys()].sort((a, b) => a - b)
      : [...rowByIndex.keys()].sort((a, b) => a - b)
  const blanks: DialogFillBlankResult[] = indices.map((index) => {
    const row = rowByIndex.get(index)
    return {
      index,
      responseText: row?.response_text ?? null,
      canonical: canonicalByIndex.get(index) ?? null,
      isCorrect: row?.is_correct ?? false,
    }
  })

  const correctCount = blanks.filter((b) => b.isCorrect).length
  return {
    ...common,
    questionType: 'dialog_fill',
    isCorrect: blanks.length > 0 && correctCount === blanks.length,
    blanks,
    correctCount,
    totalBlanks: blanks.length,
  }
}

// "Answered" differs per type: MC needs a selected option present in the list;
// short_answer needs response text; dialog_fill needs at least one filled blank.
export function isQuestionAnswered(question: QuizReportQuestion): boolean {
  if (question.questionType === 'multiple_choice') {
    return question.options.some((o) => o.id === question.selectedOptionId)
  }
  if (question.questionType === 'short_answer') {
    return question.responseText !== null && question.responseText.trim().length > 0
  }
  return question.blanks.some((b) => b.responseText !== null && b.responseText.trim().length > 0)
}
