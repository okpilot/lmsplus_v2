export type StudyQuestion = {
  id: string
  questionText: string
  questionImageUrl: string | null
  options: { id: string; text: string }[]
  correctOptionId: string
  subjectCode: string | null
  topicName: string | null
  subtopicName: string | null
  explanationText: string | null
  explanationImageUrl: string | null
  questionNumber: string | null
  difficulty: string | null
}

// Wire shape of one `start_discovery` `questions` payload entry (snake_case, jsonb options).
// String fields are typed as `unknown` — the payload arrives as `rpc<unknown>`, so nothing is
// guaranteed at runtime. `toStudyQuestion` guards each
// field with `typeof v === 'string'` before returning the typed `StudyQuestion`.
type StudyQuestionRow = {
  id: string
  question_text: unknown
  question_image_url: unknown
  options: unknown
  correct_option_id: string
  subject_code: unknown
  topic_name: unknown
  subtopic_name: unknown
  explanation_text: unknown
  explanation_image_url: unknown
  question_number: unknown
  difficulty: unknown
}

function mapOptions(raw: unknown): { id: string; text: string }[] {
  // options arrives as a jsonb array [{id,text}] — guard before mapping (code-style.md §5).
  if (!Array.isArray(raw)) return []
  return raw
    .map((o) => {
      if (!o || typeof o !== 'object') return undefined
      const { id, text } = o as { id?: unknown; text?: unknown }
      if (typeof id !== 'string' || typeof text !== 'string') return undefined
      return { id, text }
    })
    .filter((o): o is { id: string; text: string } => o !== undefined)
}

function toStudyQuestion(row: StudyQuestionRow): StudyQuestion {
  return {
    id: row.id,
    questionText: typeof row.question_text === 'string' ? row.question_text : '',
    questionImageUrl: typeof row.question_image_url === 'string' ? row.question_image_url : null,
    options: mapOptions(row.options),
    correctOptionId: row.correct_option_id,
    subjectCode: typeof row.subject_code === 'string' ? row.subject_code : null,
    topicName: typeof row.topic_name === 'string' ? row.topic_name : null,
    subtopicName: typeof row.subtopic_name === 'string' ? row.subtopic_name : null,
    explanationText: typeof row.explanation_text === 'string' ? row.explanation_text : null,
    explanationImageUrl:
      typeof row.explanation_image_url === 'string' ? row.explanation_image_url : null,
    questionNumber: typeof row.question_number === 'string' ? row.question_number : null,
    difficulty: typeof row.difficulty === 'string' ? row.difficulty : null,
  }
}

/**
 * Parses the `questions` array of a `start_discovery` payload. Rows keep payload order, which
 * is the draw order. Rows whose id / correct_option_id aren't strings are dropped so a shape
 * regression can't leak `undefined` into the typed result; a non-array payload yields [].
 */
export function parseStudyQuestions(raw: unknown): StudyQuestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (r): r is StudyQuestionRow =>
        r !== null &&
        typeof r === 'object' &&
        typeof (r as { id?: unknown }).id === 'string' &&
        typeof (r as { correct_option_id?: unknown }).correct_option_id === 'string',
    )
    .map(toStudyQuestion)
}
