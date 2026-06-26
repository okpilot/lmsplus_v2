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
type StudyQuestionRow = {
  id: string
  question_text: string | null
  question_image_url: string | null
  options: unknown
  correct_option_id: string
  subject_code: string | null
  topic_name: string | null
  subtopic_name: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  question_number: string | null
  difficulty: string | null
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
    questionText: row.question_text ?? '',
    questionImageUrl: row.question_image_url,
    options: mapOptions(row.options),
    correctOptionId: row.correct_option_id,
    subjectCode: row.subject_code,
    topicName: row.topic_name,
    subtopicName: row.subtopic_name,
    explanationText: row.explanation_text,
    explanationImageUrl: row.explanation_image_url,
    questionNumber: row.question_number,
    difficulty: row.difficulty,
  }
}

export async function getStudyQuestions(questionIds: string[]): Promise<StudyQuestion[]> {
  if (questionIds.length === 0) return []

  const supabase = await createServerSupabaseClient()
  const { data, error } = await rpc<StudyQuestionRow[]>(supabase, 'get_study_questions', {
    p_question_ids: questionIds,
  })
  if (error) {
    console.error('[getStudyQuestions] get_study_questions error:', error.message)
    return []
  }
  // Per-row guard required by code-style.md §5 — the `rpc<StudyQuestionRow[]>` cast is a
  // TypeScript assertion only, not a runtime guarantee. Drop rows whose id / correct_option_id
  // aren't strings so a shape regression can't leak `undefined` into the typed result.
  if (!Array.isArray(data)) return []
  return data
    .filter(
      (r): r is StudyQuestionRow =>
        r !== null &&
        typeof r === 'object' &&
        typeof (r as { id?: unknown }).id === 'string' &&
        typeof (r as { correct_option_id?: unknown }).correct_option_id === 'string',
    )
    .map(toStudyQuestion)
}
