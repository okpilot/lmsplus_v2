import { POSTGREST_MAX_ROWS } from '../../lib/supabase-paginate'
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
  const found = new Map<string, { id: string; users: { email: unknown } | null }>()
  for (const part of chunk(sessionIds, ID_CHUNK)) {
    const rows = await admin
      .from('quiz_sessions')
      .select('id, users!student_id(email)')
      .in('id', part)
    check('seed sessions lookup', rows.error)
    // Keyed by id: a session reported by two chunks is classified once.
    for (const r of rows.data ?? []) found.set(r.id, r)
  }
  const classified = [...found.values()].map((r) => {
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
  const parts = chunk(fixture, ID_CHUNK)
  // Soft-delete FIRST: the two updates are not atomic, and every history and attempts list filters
  // `deleted_at IS NULL`. A failure after this point leaves the row invisible rather than looking
  // like an unscored finished attempt.
  // Row count, not just `error`: a 0-row UPDATE returns 200 OK. The ids were looked up in this
  // same teardown and this UPDATE carries no filter, so every one must match.
  for (const part of parts) {
    const softDeleted = await admin
      .from('quiz_sessions')
      .update({ deleted_at: now })
      .in('id', part)
      .select('id')
    check('fixture sessions soft-delete', softDeleted.error)
    if ((softDeleted.data?.length ?? 0) !== part.length) {
      throw new Error(
        `fixture sessions soft-delete: expected ${part.length} row(s), updated ${softDeleted.data?.length ?? 0}`,
      )
    }
  }
  for (const part of parts) {
    check(
      'fixture sessions end',
      (
        await admin
          .from('quiz_sessions')
          .update({ ended_at: now })
          .in('id', part)
          .is('ended_at', null)
      ).error,
    )
  }
}

/** Ids of the entries, then the codes and sessions of those entries, deleted for one seeded sitting. */
async function deleteSeededRows(admin: Admin, sittingId: string) {
  const entries = await admin.from('exam_sitting_entries').select('id').eq('sitting_id', sittingId)
  check('seed entries lookup', entries.error)
  const entryIds = (entries.data ?? []).map((e) => e.id)
  // A full page may be truncated at `max_rows`: refuse rather than delete a partial list.
  if (entryIds.length >= POSTGREST_MAX_ROWS) {
    throw new Error(
      `deleteSeededRows: ${entryIds.length} seeded entry(s) for sitting ${sittingId} hits PostgREST's max_rows; delete in pages`,
    )
  }
  if (entryIds.length > 0) {
    const entryParts = chunk(entryIds, ID_CHUNK)
    const codeRows: { id: string; consumed_session_id: string | null }[] = []
    for (const part of entryParts) {
      const codes = await admin
        .from('internal_exam_codes')
        .select('id, consumed_session_id')
        .in('sitting_entry_id', part)
      check('seed codes lookup', codes.error)
      const rows = codes.data ?? []
      // Per response: a page clipped at `max_rows` hides a session the code delete then orphans.
      if (rows.length >= POSTGREST_MAX_ROWS) {
        throw new Error(
          `deleteSeededRows: ${rows.length} seeded code(s) for ${part.length} seeded entry(s) hits PostgREST's max_rows; delete in pages`,
        )
      }
      codeRows.push(...rows)
    }
    // Two codes may share one session (`consumed_session_id` is not unique).
    const sessionIds = [
      ...new Set(codeRows.flatMap((c) => (c.consumed_session_id ? [c.consumed_session_id] : []))),
    ]
    const split = sessionIds.length > 0 ? await classifySessions(admin, sessionIds) : null
    // Retire the fixture sessions while the codes still link to them (see `classifySessions`).
    if (split) await retireFixtureSessions(admin, split.fixture)
    // Every code goes before any session: codes and sessions are partitioned by different keys,
    // so a seeded session's consuming code may sit in a later entry chunk.
    for (const part of entryParts) {
      check(
        'seed codes delete',
        (await admin.from('internal_exam_codes').delete().in('sitting_entry_id', part)).error,
      )
    }
    for (const part of chunk(split?.seeded ?? [], ID_CHUNK)) {
      check(
        'seed sessions delete',
        (await admin.from('quiz_sessions').delete().in('id', part)).error,
      )
    }
  }
  check(
    'seed entries delete',
    (await admin.from('exam_sitting_entries').delete().eq('sitting_id', sittingId)).error,
  )
  check(
    'seed candidates delete',
    (await admin.from('exam_sitting_candidates').delete().eq('sitting_id', sittingId)).error,
  )
  check(
    'seed sittings delete',
    (await admin.from('exam_sittings').delete().eq('id', sittingId)).error,
  )
}

/**
 * Largest id list any `.in()` in this file carries. A list that can outgrow it is split with
 * `chunk(…, ID_CHUNK)`; `deleteSeededRows` takes one sitting id, and every prefix lookup that feeds
 * an `.in()` is capped by `.limit(ID_CHUNK)`. The `>= POSTGREST_MAX_ROWS` guards check read-page
 * truncation, a separate failure. Kong refuses a request line between ~7.4 KB (200 uuids: 401, reached PostgREST) and
 * ~9.2 KB (250 uuids: 414); 100 uuids is ~3.7 KB. The uuid count that fits moves with the base
 * URL, the `select=` list and the other filters, so budget bytes, not a count.
 */
const ID_CHUNK = 100

function chunk<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/** Hard-deletes the groups `seedSitting` built, members first; they must go before the seeded users (FK). */
async function deleteSeededGroups(admin: Admin) {
  const groups = await admin
    .from('student_groups')
    .select('id')
    .like('name', `${EXAM_SITTING_SEED_GROUP_PREFIX}%`)
    .limit(ID_CHUNK)
  check('seed groups lookup', groups.error)
  const ids = (groups.data ?? []).map((g) => g.id)
  if (ids.length === 0) return
  check(
    'seed group members delete',
    (await admin.from('student_group_members').delete().in('group_id', ids)).error,
  )
  check('seed groups delete', (await admin.from('student_groups').delete().in('id', ids)).error)
}

/** Sessions of the seeded students found by student (a spec may seed one with no code), removed before their users; the hard delete is safe because `createStudent` sets no password, so a seeded student cannot sign in and cannot produce `quiz_session_answers` or `student_responses` rows. */
async function deleteSeededStudentSessions(admin: Admin, userIds: string[]) {
  if (userIds.length === 0) return
  const sessions = await admin.from('quiz_sessions').select('id').in('student_id', userIds)
  check('seed student sessions lookup', sessions.error)
  const ids = (sessions.data ?? []).map((r) => r.id)
  // A full page may be truncated at `max_rows`: refuse rather than delete a partial list.
  if (ids.length >= POSTGREST_MAX_ROWS) {
    throw new Error(
      `deleteSeededStudentSessions: ${ids.length} sessions for ${userIds.length} seeded student(s) hits PostgREST's max_rows; delete in pages`,
    )
  }
  if (ids.length === 0) return
  // Chunked: up to `ID_CHUNK` students may own any number of sessions.
  for (const part of chunk(ids, ID_CHUNK)) {
    // Codes first: `internal_exam_codes_consumed_session_id_fkey` pins these sessions.
    check(
      'seed student session codes delete',
      (await admin.from('internal_exam_codes').delete().in('consumed_session_id', part)).error,
    )
    check(
      'seed student sessions delete',
      (await admin.from('quiz_sessions').delete().in('id', part)).error,
    )
  }
}

/** Deletes the students `seedSitting` created (users row, then auth user) once nothing references them. */
async function deleteSeededUsers(admin: Admin) {
  const users = await admin
    .from('users')
    .select('id')
    .like('email', `${EXAM_SITTING_SEED_EMAIL_PREFIX}%`)
    .limit(ID_CHUNK)
  check('seed users lookup', users.error)
  const userRows = users.data ?? []
  const errors: string[] = []
  // FK prerequisite: `quiz_sessions.student_id` pins the sessions before their users, so a failure
  // here skips every user delete.
  try {
    await deleteSeededStudentSessions(
      admin,
      userRows.map((u) => u.id),
    )
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  if (errors.length > 0) throw new Error(errors.join('; '))
  for (const u of userRows) {
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

/** Hard-deletes the seeded sittings (built by `seedSitting` or marked `seeded`), with their people, codes and users (service role, test data only). */
async function cleanupSeededExamSittings(): Promise<void> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('exam_sittings')
    .select('id')
    .like('permitted_materials', `${EXAM_SITTING_SEED_PREFIX}%`)
  check('seed lookup', error)
  const ids = (data ?? []).map((r) => r.id)
  // `exam_sitting_entries.user_id` and `exam_sitting_candidates.user_id` both REFERENCE users(id)
  // with no cascade: a truncated list leaves rows that FK-fail the `deleteSeededUsers` deletes of
  // their users (it deletes up to `ID_CHUNK` `e2e-sit-` users per run).
  if (ids.length >= POSTGREST_MAX_ROWS) {
    throw new Error(
      `cleanupSeededExamSittings: ${ids.length} seeded sitting(s) hits PostgREST's max_rows; delete in pages`,
    )
  }
  const errors: string[] = []
  // One sitting per call: ~61 entries and codes, so `deleteSeededRows`'s own page guards stay out
  // of reach.
  for (const id of ids) {
    try {
      await deleteSeededRows(admin, id)
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

/** Soft-deletes the open marked exam_sittings that have no live entries or candidates, then hard-deletes the seeded sittings (built by `seedSitting` or marked `seeded`), open or closed, with their people, codes and users (service role, test data only). */
export async function cleanupE2eExamSittings(): Promise<void> {
  const errors: string[] = []
  for (const step of [cleanupEmptySittings, cleanupSeededExamSittings, releaseSeededEnrolments]) {
    try {
      await step()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`cleanupE2eExamSittings: ${errors.join('; ')}`)
}

async function cleanupEmptySittings(): Promise<void> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('exam_sittings')
    .select('id')
    .like('permitted_materials', `${EXAM_SITTING_E2E_PREFIX}%`)
    .is('deleted_at', null)
    .is('closed_at', null)
    .limit(ID_CHUNK)
  if (error) throw new Error(`cleanupE2eExamSittings lookup: ${error.message}`)
  const marked = (data ?? []).map((r) => r.id)
  if (marked.length === 0) return
  const withPeople = new Set<string>()
  for (const table of ['exam_sitting_entries', 'exam_sitting_candidates'] as const) {
    const res = await admin
      .from(table)
      .select('sitting_id')
      .in('sitting_id', marked)
      .is('deleted_at', null)
    if (res.error) throw new Error(`cleanupE2eExamSittings ${table}: ${res.error.message}`)
    const rows = res.data ?? []
    // A truncated page drops a sitting that HAS people, which then gets soft-deleted.
    if (rows.length >= POSTGREST_MAX_ROWS) {
      throw new Error(
        `cleanupEmptySittings: ${rows.length} ${table} row(s) for ${marked.length} marked sitting(s) hits PostgREST's max_rows; read in pages`,
      )
    }
    for (const r of rows) withPeople.add(r.sitting_id)
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
