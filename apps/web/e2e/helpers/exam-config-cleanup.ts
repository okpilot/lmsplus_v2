import { getAdminClient } from './supabase'

/** Soft-deletes the active exam_configs of a subject (service role). Zero rows is fine. */
export async function softDeleteSubjectExamConfigs(subjectCode: string): Promise<void> {
  const admin = getAdminClient()
  const { data: subject, error: subjectError } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', subjectCode)
    .maybeSingle()
  if (subjectError) throw new Error(`softDeleteSubjectExamConfigs subject: ${subjectError.message}`)
  if (!subject) return

  const { data, error } = await admin
    .from('exam_configs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('subject_id', subject.id)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`softDeleteSubjectExamConfigs update: ${error.message}`)
  if (data && data.length > 0) {
    console.log(`softDeleteSubjectExamConfigs: soft-deleted ${data.length} config(s)`)
  }
}
