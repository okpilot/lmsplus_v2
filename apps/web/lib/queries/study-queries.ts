import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

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

// Wire shape of one `get_study_questions` RETURNS TABLE row (snake_case, jsonb options).
// String fields are typed as `unknown` — the `rpc<StudyQuestionRow[]>` cast is a
// TypeScript assertion only, not a runtime guarantee. `toStudyQuestion` guards each
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

export async function getStudyQuestions(questionIds: string[]): Promise<StudyQuestion[]> {
  if (questionIds.length === 0) return []

  const supabase = await createServerSupabaseClient()
  const { data, error } = await rpc<StudyQuestionRow[]>(supabase, 'get_study_questions', {
    p_question_ids: questionIds,
  })
  if (error) {
    // Query helper throws (code-style.md §5) — startStudy's try/catch maps it to a
    // generic message. Collapsing an auth/transport failure into [] would be
    // indistinguishable from a legitimate "no questions found" result.
    throw new Error(`Failed to fetch study questions: ${error.message}`)
  }
  // Per-row guard required by code-style.md §5 — the `rpc<StudyQuestionRow[]>` cast is a
  // TypeScript assertion only, not a runtime guarantee. Drop rows whose id / correct_option_id
  // aren't strings so a shape regression can't leak `undefined` into the typed result.
  if (!Array.isArray(data)) return []
  // `WHERE id = ANY(p_question_ids)` returns rows in arbitrary order — re-sort to the
  // caller's order so the deck matches the (randomly-sampled) selection order rather than
  // reshuffling between selection and handoff. IDs not in the order map sort last.
  const orderById = new Map(questionIds.map((id, i) => [id, i]))
  return data
    .filter(
      (r): r is StudyQuestionRow =>
        r !== null &&
        typeof r === 'object' &&
        typeof (r as { id?: unknown }).id === 'string' &&
        typeof (r as { correct_option_id?: unknown }).correct_option_id === 'string',
    )
    .map(toStudyQuestion)
    .sort(
      (a, b) =>
        (orderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
}
