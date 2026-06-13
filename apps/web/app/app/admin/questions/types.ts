export type QuestionOption = {
  id: 'a' | 'b' | 'c' | 'd'
  text: string
}

// Admin-only type. The MC answer key lives in correct_option_id (#823), NOT
// inside options[] — options carries only {id, text}. The key is REVOKE-gated
// and never returned by the admin list query; it is fetched on demand via
// get_question_authoring_fields() when the edit dialog opens.
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
  // REVOKE-gated (#823): null on the admin list query; fetched separately for the edit form.
  correct_option_id: 'a' | 'b' | 'c' | 'd' | null
  explanation_text: string
  question_image_url: string | null
  explanation_image_url: string | null
  lo_reference: string | null
  has_calculations: boolean
  created_at: string
  updated_at: string
}

export type QuestionFilters = {
  subjectId?: string
  topicId?: string
  subtopicId?: string
  status?: 'active' | 'draft'
  hasCalculations?: boolean
  search?: string
  page?: number
}

export type QuestionsListResult =
  | { ok: true; questions: QuestionRow[]; totalCount: number }
  | { ok: false; error: string }
