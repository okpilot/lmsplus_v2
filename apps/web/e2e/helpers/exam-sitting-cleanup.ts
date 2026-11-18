import { EXAM_SITTING_E2E_PREFIX } from './exam-sitting-markers'
import { getAdminClient } from './supabase'

/** Hard-deletes the marked exam_sittings that have no entries or candidates (service role, test data only); red-team seeds with people are left alone. */
export async function cleanupE2eExamSittings(): Promise<void> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('exam_sittings')
    .select('id')
    .like('permitted_materials', `${EXAM_SITTING_E2E_PREFIX}%`)
  if (error) throw new Error(`cleanupE2eExamSittings lookup: ${error.message}`)
  const marked = (data ?? []).map((r) => r.id)
  if (marked.length === 0) return
  const withPeople = new Set<string>()
  for (const table of ['exam_sitting_entries', 'exam_sitting_candidates'] as const) {
    const res = await admin.from(table).select('sitting_id').in('sitting_id', marked)
    if (res.error) throw new Error(`cleanupE2eExamSittings ${table}: ${res.error.message}`)
    for (const r of res.data ?? []) withPeople.add(r.sitting_id)
  }
  const ids = marked.filter((id) => !withPeople.has(id))
  if (ids.length === 0) return

  const { data: deleted, error: deleteError } = await admin
    .from('exam_sittings')
    .delete()
    .in('id', ids)
    .select('id')
  if (deleteError) throw new Error(`cleanupE2eExamSittings delete: ${deleteError.message}`)
  const n = deleted?.length ?? 0
  if (n > 0) console.log(`cleanupE2eExamSittings: deleted ${n} sitting(s)`)
}
