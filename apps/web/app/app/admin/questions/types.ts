export type QuestionOption = {
  id: 'a' | 'b' | 'c' | 'd'
  text: string
  correct: boolean
}

// Admin-only type. options[].correct is intentionally included for the edit form.
// Never use QuestionRow in student-facing queries — use get_quiz_questions() RPC instead.
export type QuestionRow = {
  id: string
  question_number: string | null
  question_text: string
  difficulty: 'easy' | 'medium' | 'hard'
  status: 'active' | 'draft'
  subject_id: string
  topic_id: string
  subtopic_id: string | null
  subject: { code: string; name: string } | null
  topic: { name: string } | null
  subtopic: { name: string } | null
  options: QuestionOption[]
  explanation_text: string
  question_image_url: string | null
  explanation_image_url: string | null
  lo_reference: string | null
  created_at: string
  updated_at: string
}

export type QuestionFilters = {
  subjectId?: string
  topicId?: string
  subtopicId?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  status?: 'active' | 'draft'
  search?: string
  page?: number
}

export type QuestionsListResult =
  | { ok: true; questions: QuestionRow[]; totalCount: number }
  | { ok: false; error: string }
