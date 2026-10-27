import { getAdminClient } from './supabase'

/** Soft-deletes the active exam_configs of a subject created at or after `createdSince` (service role). Zero rows is fine. */
export async function softDeleteSubjectExamConfigs(
  subjectCode: string,
  createdSince: string,
): Promise<void> {
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
    .gte('created_at', createdSince)
    .select('id')
  if (error) throw new Error(`softDeleteSubjectExamConfigs update: ${error.message}`)
  if (data && data.length > 0) {
    console.log(`softDeleteSubjectExamConfigs: soft-deleted ${data.length} config(s)`)
  }
}

/** Counts the active exam_configs of a subject (service role). 0 when the subject is missing. */
export async function countActiveSubjectExamConfigs(subjectCode: string): Promise<number> {
  const admin = getAdminClient()
  const { data: subject, error: subjectError } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', subjectCode)
    .maybeSingle()
  if (subjectError)
    throw new Error(`countActiveSubjectExamConfigs subject: ${subjectError.message}`)
  if (!subject) return 0

  const { count, error } = await admin
    .from('exam_configs')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', subject.id)
    .is('deleted_at', null)
  if (error) throw new Error(`countActiveSubjectExamConfigs count: ${error.message}`)
  return count ?? 0
}
