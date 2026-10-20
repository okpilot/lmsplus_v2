import { getAdminClient } from './supabase'

/** Stable marker on every e2e-created quiz_drafts row, stored in session_config.subjectName. */
export const E2E_DRAFT_MARKER = '[E2E_DRAFT]'

async function lookupStudent(studentEmail: string) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', studentEmail)
    .maybeSingle()
  if (error) throw new Error(`quiz-draft student lookup: ${error.message}`)
  if (!data) throw new Error(`quiz-draft: no user ${studentEmail}`)
  return data
}

/** Inserts one marked draft over real question ids; returns the draft id. */
export async function seedMarkedDraft(studentEmail: string, label: string): Promise<string> {
  const admin = getAdminClient()
  const student = await lookupStudent(studentEmail)
  const { data: questions, error: qError } = await admin
    .from('questions')
    .select('id')
    .is('deleted_at', null)
    .limit(3)
  if (qError) throw new Error(`seedMarkedDraft questions: ${qError.message}`)
  if (!questions || questions.length < 3) throw new Error('seedMarkedDraft: need 3 questions')
  const { data, error } = await admin
    .from('quiz_drafts')
    .insert({
      student_id: student.id,
      organization_id: student.organization_id,
      session_config: {
        sessionId: crypto.randomUUID(),
        subjectName: `${E2E_DRAFT_MARKER} ${label}`,
        subjectCode: 'E2E',
        mode: 'quick_quiz',
      },
      question_ids: questions.map((q) => q.id),
      answers: {},
      current_index: 0,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedMarkedDraft insert: ${error.message}`)
  return data.id
}

export async function countMarkedDrafts(studentEmail: string): Promise<number> {
  const student = await lookupStudent(studentEmail)
  const { data, error } = await getAdminClient()
    .from('quiz_drafts')
    .select('id')
    .eq('student_id', student.id)
    .like('session_config->>subjectName', `${E2E_DRAFT_MARKER}%`)
  if (error) throw new Error(`countMarkedDrafts: ${error.message}`)
  return data?.length ?? 0
}

/** quiz_drafts is hard-delete-by-design (docs/database.md §3). */
export async function cleanupMarkedDrafts(studentEmail: string): Promise<void> {
  const student = await lookupStudent(studentEmail)
  const { data, error } = await getAdminClient()
    .from('quiz_drafts')
    .delete()
    .eq('student_id', student.id)
    .like('session_config->>subjectName', `${E2E_DRAFT_MARKER}%`)
    .select('id')
  if (error) throw new Error(`cleanupMarkedDrafts: ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[cleanupMarkedDrafts] removed ${data?.length} draft(s)`)
  }
}
