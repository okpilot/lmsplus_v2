import { EXAM_SITTING_E2E_PREFIX } from './exam-sitting-markers'
import { getAdminClient } from './supabase'

/** Hard-deletes the exam_sittings whose permitted_materials carry the E2E marker (service role, test data only). Zero rows is fine. */
export async function cleanupE2eExamSittings(): Promise<void> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('exam_sittings')
    .select('id')
    .like('permitted_materials', `${EXAM_SITTING_E2E_PREFIX}%`)
  if (error) throw new Error(`cleanupE2eExamSittings lookup: ${error.message}`)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length === 0) return

  const { error: deleteError } = await admin.from('exam_sittings').delete().in('id', ids)
  if (deleteError) throw new Error(`cleanupE2eExamSittings delete: ${deleteError.message}`)
  console.log(`cleanupE2eExamSittings: deleted ${ids.length} sitting(s)`)
}
