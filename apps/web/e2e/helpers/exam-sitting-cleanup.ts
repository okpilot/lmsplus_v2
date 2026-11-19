import {
  EXAM_SITTING_E2E_PREFIX,
  EXAM_SITTING_SEED_EMAIL_PREFIX,
  EXAM_SITTING_SEED_GROUP_PREFIX,
  EXAM_SITTING_SEED_PREFIX,
  makeSittingE2eMaterials,
} from './exam-sitting-markers'
import { getAdminClient } from './supabase'

type Admin = ReturnType<typeof getAdminClient>

function check(what: string, error: { message: string } | null) {
  if (error) throw new Error(`cleanupE2eExamSittings ${what}: ${error.message}`)
}

/**
 * Sessions of seeded students are deleted (their users go next). A fixture student's session
 * (e.g. the internal-exam student) may hold immutable answers: it is ended and soft-deleted instead.
 */
async function removeSeededSessions(admin: Admin, sessionIds: string[]) {
  const rows = await admin
    .from('quiz_sessions')
    .select('id, users!student_id(email)')
    .in('id', sessionIds)
  check('seed sessions lookup', rows.error)
  const isSeeded = (email: string | undefined) =>
    email?.startsWith(EXAM_SITTING_SEED_EMAIL_PREFIX) ?? false
  const seeded = (rows.data ?? []).filter((r) => isSeeded(r.users?.email)).map((r) => r.id)
  const fixture = (rows.data ?? []).filter((r) => !isSeeded(r.users?.email)).map((r) => r.id)
  if (seeded.length > 0) {
    check(
      'seed sessions delete',
      (await admin.from('quiz_sessions').delete().in('id', seeded)).error,
    )
  }
  if (fixture.length === 0) return
  const now = new Date().toISOString()
  check(
    'fixture sessions end',
    (
      await admin
        .from('quiz_sessions')
        .update({ ended_at: now })
        .in('id', fixture)
        .is('ended_at', null)
    ).error,
  )
  check(
    'fixture sessions soft-delete',
    (await admin.from('quiz_sessions').update({ deleted_at: now }).in('id', fixture)).error,
  )
}

/** Ids of the entries, then the codes and sessions of those entries, deleted for the seeded sittings. */
async function deleteSeededRows(admin: Admin, sittingIds: string[]) {
  const entries = await admin.from('exam_sitting_entries').select('id').in('sitting_id', sittingIds)
  check('seed entries lookup', entries.error)
  const entryIds = (entries.data ?? []).map((e) => e.id)
  if (entryIds.length > 0) {
    const codes = await admin
      .from('internal_exam_codes')
      .select('id, consumed_session_id')
      .in('sitting_entry_id', entryIds)
    check('seed codes lookup', codes.error)
    const sessionIds = (codes.data ?? []).flatMap((c) =>
      c.consumed_session_id ? [c.consumed_session_id] : [],
    )
    check(
      'seed codes delete',
      (await admin.from('internal_exam_codes').delete().in('sitting_entry_id', entryIds)).error,
    )
    if (sessionIds.length > 0) await removeSeededSessions(admin, sessionIds)
  }
  check(
    'seed entries delete',
    (await admin.from('exam_sitting_entries').delete().in('sitting_id', sittingIds)).error,
  )
  check(
    'seed candidates delete',
    (await admin.from('exam_sitting_candidates').delete().in('sitting_id', sittingIds)).error,
  )
  check(
    'seed sittings delete',
    (await admin.from('exam_sittings').delete().in('id', sittingIds)).error,
  )
}

/** Hard-deletes the groups `seedSitting` built, members first; they must go before the seeded users (FK). */
async function deleteSeededGroups(admin: Admin) {
  const groups = await admin
    .from('student_groups')
    .select('id')
    .like('name', `${EXAM_SITTING_SEED_GROUP_PREFIX}%`)
  check('seed groups lookup', groups.error)
  const ids = (groups.data ?? []).map((g) => g.id)
  if (ids.length === 0) return
  check(
    'seed group members delete',
    (await admin.from('student_group_members').delete().in('group_id', ids)).error,
  )
  check('seed groups delete', (await admin.from('student_groups').delete().in('id', ids)).error)
}

/** Deletes the students `seedSitting` created (users row, then auth user) once nothing references them. */
async function deleteSeededUsers(admin: Admin) {
  const users = await admin
    .from('users')
    .select('id')
    .like('email', `${EXAM_SITTING_SEED_EMAIL_PREFIX}%`)
  check('seed users lookup', users.error)
  const errors: string[] = []
  for (const u of users.data ?? []) {
    try {
      check(
        'seed enrolments delete',
        (await admin.from('course_enrolments').delete().eq('user_id', u.id)).error,
      )
      check('seed user delete', (await admin.from('users').delete().eq('id', u.id)).error)
      const authDelete = await admin.auth.admin.deleteUser(u.id)
      check('seed auth user delete', authDelete.error)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(errors.join('; '))
}

/** Hard-deletes the sittings `seedSitting` built, with their people, codes and users (service role, test data only). */
async function cleanupSeededExamSittings(): Promise<void> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('exam_sittings')
    .select('id')
    .like('permitted_materials', `${EXAM_SITTING_SEED_PREFIX}%`)
  check('seed lookup', error)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length > 0) await deleteSeededRows(admin, ids)
  const errors: string[] = []
  // Groups before users; a failed group step does not skip the users (their delete cascades the memberships).
  for (const step of [deleteSeededGroups, deleteSeededUsers]) {
    try {
      await step(admin)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(errors.join('; '))
}

/** Hard-deletes the marked exam_sittings that have no entries or candidates (service role, test data only); red-team seeds with people are left alone. Seeded sittings go with their people. */
export async function cleanupE2eExamSittings(): Promise<void> {
  const errors: string[] = []
  for (const step of [cleanupEmptySittings, cleanupSeededExamSittings]) {
    try {
      await step()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
}

async function cleanupEmptySittings(): Promise<void> {
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

/** Marks a sitting created through the UI so the cleanup finds it (service role, test data only). Throws on error or when no row matched. */
export async function markE2eSitting(id: string): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('exam_sittings')
    .update({ permitted_materials: makeSittingE2eMaterials() })
    .eq('id', id)
    .select('id')
  if (error) throw new Error(`markE2eSitting: ${error.message}`)
  if ((data ?? []).length === 0) throw new Error(`markE2eSitting: no sitting ${id}`)
}
