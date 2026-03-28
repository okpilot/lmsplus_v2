/** GDPR data export payload — Articles 15 (access) and 20 (portability). */
export type GdprExportPayload = {
  exported_at: string
  user: {
    id: string
    email: string
    full_name: string | null
    role: string
    created_at: string
    last_active_at: string | null
  }
  quiz_sessions: Array<{
    id: string
    mode: string
    subject_id: string | null
    topic_id: string | null
    total_questions: number
    correct_count: number
    score_percentage: number | null
    started_at: string
    ended_at: string | null
  }>
  quiz_answers: Array<{
    session_id: string
    question_id: string
    selected_option_id: string
    is_correct: boolean
    response_time_ms: number
    answered_at: string
  }>
  student_responses: Array<{
    question_id: string
    selected_option_id: string
    is_correct: boolean
    response_time_ms: number
    session_id: string | null
    created_at: string
  }>
  fsrs_cards: Array<{
    question_id: string
    state: string
    due: string
    stability: number
    difficulty: number
    reps: number
    lapses: number
    last_review: string | null
  }>
  flagged_questions: Array<{
    question_id: string
    flagged_at: string
  }>
  question_comments: Array<{
    id: string
    question_id: string
    body: string
    created_at: string
  }>
  user_consents: Array<{
    document_type: string
    document_version: string
    accepted: boolean
    created_at: string
  }>
  audit_events: Array<{
    event_type: string
    resource_type: string
    resource_id: string | null
    ip_address: string | null
    created_at: string
  }>
}
