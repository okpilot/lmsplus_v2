import { ADMIN_TEST_EMAIL } from './admin-supabase'
import {
  EXAM_SITTING_E2E_PREFIX,
  EXAM_SITTING_SEED_EMAIL_PREFIX,
  EXAM_SITTING_SEED_GROUP_PREFIX,
  EXAM_SITTING_SEED_PREFIX,
  makeSittingE2eMaterials,
  makeSittingSeedMaterials,
} from './exam-sitting-markers'
import { releaseSeededEnrolments } from './sitting-code'
import { getAdminClient } from './supabase'

type Admin = ReturnType<typeof getAdminClient>

function check(what: string, error: { message: string } | null) {
  if (error) throw new Error(`cleanupE2eExamSittings ${what}: ${error.message}`)
}

/**
 * Splits the sessions by owner. `internal_exam_codes.consumed_session_id` references
 * `quiz_sessions` with NO ACTION, so a seeded session can only be hard-deleted after its code is
 * gone; a fixture session is retired with UPDATEs, which the FK does not block. The caller runs
 * `retireFixtureSessions` BEFORE deleting the codes, so a failure there cannot orphan a live
 * fixture session whose only link was the code it just deleted.
 */
async function classifySessions(admin: Admin, sessionIds: string[]) {
  const rows = await admin
    .from('quiz_sessions')
    .select('id, users!student_id(email)')
    .in('id', sessionIds)
  check('seed sessions lookup', rows.error)
  const classified = (rows.data ?? []).map((r) => {
    const email = r.users?.email
    // An unresolved embed is unclassifiable. Routed to the fixture branch, a seeded row is only
    // soft-deleted and `deleteSeededUsers` then fails on the `student_id` FK, burying the cause.
    // `typeof`, not `=== undefined`: a non-string would reach `.startsWith` as a TypeError, which
    // aborts the teardown before any delete runs.
    if (typeof email !== 'string') {
      throw new Error(`seed sessions lookup: no student for session ${r.id}`)
    }
    return { id: r.id, seeded: email.startsWith(EXAM_SITTING_SEED_EMAIL_PREFIX) }
  })
  return {
    seeded: classified.filter((r) => r.seeded).map((r) => r.id),
    fixture: classified.filter((r) => !r.seeded).map((r) => r.id),
  }
}

/** A fixture student's session may hold immutable answers: it is ended and soft-deleted, never gone. */
async function retireFixtureSessions(admin: Admin, fixture: string[]) {
  if (fixture.length === 0) return
  const now = new Date().toISOString()
  // Soft-delete FIRST: the two updates are not atomic, and every history and attempts list filters
  // `deleted_at IS NULL`. A failure after this point leaves the row invisible rather than looking
  // like an unscored finished attempt.
  // Row count, not just `error`: a 0-row UPDATE returns 200 OK. The ids were looked up in this
  // same teardown and this UPDATE carries no filter, so every one must match.
  const softDeleted = await admin
    .from('quiz_sessions')
    .update({ deleted_at: now })
    .in('id', fixture)
    .select('id')
  check('fixture sessions soft-delete', softDeleted.error)
  if ((softDeleted.data?.length ?? 0) !== fixture.length) {
    throw new Error(
      `fixture sessions soft-delete: expected ${fixture.length} row(s), updated ${softDeleted.data?.length ?? 0}`,
    )
  }
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
    const split = sessionIds.length > 0 ? await classifySessions(admin, sessionIds) : null
    // Retire the fixture sessions while the codes still link to them (see `classifySessions`).
    if (split) await retireFixtureSessions(admin, split.fixture)
    check(
      'seed codes delete',
      (await admin.from('internal_exam_codes').delete().in('sitting_entry_id', entryIds)).error,
    )
    if (split && split.seeded.length > 0) {
      check(
        'seed sessions delete',
        (await admin.from('quiz_sessions').delete().in('id', split.seeded)).error,
      )
    }
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

/** Sessions of the seeded students found by student (a spec may seed one with no code), removed before their users. */
async function deleteSeededStudentSessions(admin: Admin, userIds: string[]) {
  if (userIds.length === 0) return
  const sessions = await admin.from('quiz_sessions').select('id').in('student_id', userIds)
  check('seed student sessions lookup', sessions.error)
  const ids = (sessions.data ?? []).map((r) => r.id)
  if (ids.length === 0) return
  // No code references these, so nothing pins the delete order here — but a session is still
  // classified: `student_id` matched the seed email prefix, and a fixture session reached through
  // a shared id must be retired, never hard-deleted (see `classifySessions`).
  const split = await classifySessions(admin, ids)
  await retireFixtureSessions(admin, split.fixture)
  if (split.seeded.length > 0) {
    check(
      'seed student sessions delete',
      (await admin.from('quiz_sessions').delete().in('id', split.seeded)).error,
    )
  }
}

/** Deletes the students `seedSitting` created (users row, then auth user) once nothing references them. */
async function deleteSeededUsers(admin: Admin) {
  const users = await admin
    .from('users')
    .select('id')
    .like('email', `${EXAM_SITTING_SEED_EMAIL_PREFIX}%`)
  check('seed users lookup', users.error)
  const errors: string[] = []
  try {
    await deleteSeededStudentSessions(
      admin,
      (users.data ?? []).map((u) => u.id),
    )
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
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
  const errors: string[] = []
  if (ids.length > 0) {
    try {
      await deleteSeededRows(admin, ids)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  // FK-dependent step (code-style.md § Multi-Step Cleanup Needs a Per-Step Error Accumulator,
  // "Dependent steps"): the users are parents of the rows above, so running it
  // after a failed rows delete only raises FK errors that bury the real cause. The leaked rows and
  // their auth users are found again by the next afterEach, keyed on the email prefix.
  if (errors.length === 0) {
    // Groups before users; a failed group step does not skip the users (their delete cascades the memberships).
    for (const step of [deleteSeededGroups, deleteSeededUsers]) {
      try {
        await step(admin)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  } else errors.push('seed users delete skipped: seeded rows delete failed')
  if (errors.length > 0) throw new Error(errors.join('; '))
}

/** Soft-deletes the open marked exam_sittings that have no entries or candidates, then hard-deletes the sittings `seedSitting` built with their people, codes and users (service role, test data only); closed sittings (CHECK exam_sittings_closed_not_cancelled) and red-team seeds with people are left alone. */
export async function cleanupE2eExamSittings(): Promise<void> {
  const errors: string[] = []
  for (const step of [cleanupEmptySittings, cleanupSeededExamSittings, releaseSeededEnrolments]) {
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

/**
 * Marks a sitting created through the UI so the cleanup finds it (service role, test data only). Throws on error or when no row matched.
 * `empty` (default): removed only while it has no people. `seeded`: removed with its people, codes and sessions.
 */
export async function markE2eSitting(
  id: string,
  kind: 'empty' | 'seeded' = 'empty',
): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('exam_sittings')
    .update({
      permitted_materials:
        kind === 'seeded' ? makeSittingSeedMaterials() : makeSittingE2eMaterials(),
    })
    .eq('id', id)
    .select('id')
  if (error) throw new Error(`markE2eSitting: ${error.message}`)
  if ((data ?? []).length === 0) throw new Error(`markE2eSitting: no sitting ${id}`)
}
