import { readUserId } from './recovery-code'
import { getAdminClient } from './supabase'

/** Soft-deletes every active flag of the student (flags are never hard-deleted). */
export async function softDeleteStudentFlags(studentEmail: string): Promise<void> {
  const studentId = await readUserId(studentEmail)
  const { data, error } = await getAdminClient()
    .from('flagged_questions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .is('deleted_at', null)
    .select('question_id')
  if (error) throw new Error(`softDeleteStudentFlags (${studentEmail}): ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[softDeleteStudentFlags] soft-deleted ${data?.length} flag(s)`)
  }
}

/** Flags one question for the student; revives a soft-deleted row (PK student_id,question_id). */
export async function seedStudentFlag(studentEmail: string, questionId: string): Promise<void> {
  const studentId = await readUserId(studentEmail)
  const { error } = await getAdminClient().from('flagged_questions').upsert(
    {
      student_id: studentId,
      question_id: questionId,
      flagged_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: 'student_id,question_id' },
  )
  if (error) throw new Error(`seedStudentFlag (${studentEmail}): ${error.message}`)
}
