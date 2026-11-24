import { ADMIN_TEST_EMAIL } from './admin-supabase'
import { EXAM_SITTING_E2E_PREFIX } from './exam-sitting-markers'
import { getAdminClient } from './supabase'

/** Soft-deletes the open marked exam_sittings that have no entries or candidates (service role, test data only); closed sittings (CHECK exam_sittings_closed_not_cancelled) and red-team seeds with people are left alone. */
export async function cleanupE2eExamSittings(): Promise<void> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('exam_sittings')
    .select('id')
    .like('permitted_materials', `${EXAM_SITTING_E2E_PREFIX}%`)
    .is('deleted_at', null)
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

  const { data: adminUser, error: adminError } = await admin
    .from('users')
    .select('id')
    .eq('email', ADMIN_TEST_EMAIL)
    .is('deleted_at', null)
    .single()
  if (adminError || !adminUser) {
    throw new Error(
      `cleanupE2eExamSittings admin: ${adminError?.message ?? 'admin user not found'}`,
    )
  }

  const now = new Date().toISOString()
  const { data: deleted, error: deleteError } = await admin
    .from('exam_sittings')
    .update({ deleted_at: now, deleted_by: adminUser.id })
    .in('id', ids)
    .is('closed_at', null)
    .is('deleted_at', null)
    .select('id')
  if (deleteError) throw new Error(`cleanupE2eExamSittings soft-delete: ${deleteError.message}`)
  const n = deleted?.length ?? 0
  if (n > 0) console.log(`cleanupE2eExamSittings: soft-deleted ${n} sitting(s)`)
}
