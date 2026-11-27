import { ADMIN_TEST_EMAIL } from './admin-supabase'
import { createStudents } from './exam-sitting-seed'
import { ensureEnrolment } from './sitting-code'
import { getAdminClient } from './supabase'

const PREFIX = 'exam-sitting-flow-seed'

type Admin = ReturnType<typeof getAdminClient>

export type FlowSubject = { id: string; short: string; name: string; courseId: string }

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${PREFIX} ${what}: ${error?.message ?? 'no data'}`)
}

export async function adminIds(admin: Admin): Promise<{ adminId: string; orgId: string }> {
  const row = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', ADMIN_TEST_EMAIL)
    .is('deleted_at', null)
    .single()
  if (row.error || !row.data) fail('admin lookup', row.error)
  return { adminId: row.data.id, orgId: row.data.organization_id }
}

/** A live subject whose name contains `fragment`. */
export async function findSubject(fragment: string): Promise<FlowSubject> {
  const res = await getAdminClient()
    .from('easa_subjects')
    .select('id, short, name, course_id')
    .ilike('name', `%${fragment}%`)
    .is('deleted_at', null)
    .order('name')
    .limit(1)
    .single()
  if (res.error || !res.data) fail(`subject ${fragment}`, res.error)
  const short = res.data.short
  // An empty `short` makes the `Add ${short}` checkbox name match every subject's.
  if (typeof short !== 'string' || short === '') {
    fail(`subject ${fragment} short (checkbox locators need it)`, null)
  }
  return { id: res.data.id, short, name: res.data.name, courseId: res.data.course_id }
}

/** Students with an `e2e-sit-` email (the sitting cleanup deletes them), enrolled in `courseId`. */
export async function seedEnrolledStudents(
  names: string[],
  courseId: string,
): Promise<{ name: string; userId: string }[]> {
  const admin = getAdminClient()
  const { adminId, orgId } = await adminIds(admin)
  const ids = await createStudents(admin, orgId, names, PREFIX)
  // track: false: deleted with the users (enrolments cascade)
  for (const userId of ids)
    await ensureEnrolment(admin, { orgId, adminId, userId, courseId }, { track: false })
  return names.map((name, i) => ({ name, userId: ids[i] as string }))
}

export type SittingCode = {
  code: string
  userId: string
  voided: boolean
  voidReason: string | null
}

/** Every code of the sitting's entries (service role read). */
export async function readSittingCodes(sittingId: string): Promise<SittingCode[]> {
  const admin = getAdminClient()
  const { orgId } = await adminIds(admin)
  const entries = await admin
    .from('exam_sitting_entries')
    .select('id')
    .eq('organization_id', orgId)
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (entries.error) fail('entries', entries.error)
  const ids = (entries.data ?? []).map((e) => e.id)
  if (ids.length === 0) return []
  const codes = await admin
    .from('internal_exam_codes')
    .select('code, student_id, voided_at, void_reason')
    .eq('organization_id', orgId)
    .in('sitting_entry_id', ids)
    .is('deleted_at', null)
  if (codes.error) fail('codes', codes.error)
  return (codes.data ?? []).map((c) => ({
    code: c.code,
    userId: c.student_id,
    voided: c.voided_at !== null,
    voidReason: c.void_reason,
  }))
}

/** Original `time_limit_seconds` per config id widened this run, keyed so two subjects both restore. */
const widenedTimers = new Map<string, number>()

/**
 * Widens the subject's exam timer for this run, remembering the old value for `restoreExamTimer`.
 *
 * The seeded MET config allows 60 s for 10 questions (`scripts/seed-e2e.ts`), and `exam-flow.spec.ts`
 * tests that expiry, so the seed cannot change.
 *
 * KNOWN LIMIT (#1837): the restore map is in-process; a killed run leaves the timer widened until `pnpm supabase db reset`, and `e2e/exam-flow.spec.ts` then fails its 60 s expiry assertion.
 *
 * Org-scoped like the RPC: `start_internal_exam_session` resolves the config with `ec.organization_id = v_org_id` (mig 20261117001400).
 */
export async function widenExamTimer(subjectId: string, seconds = 3600): Promise<void> {
  const admin = getAdminClient()
  const { orgId } = await adminIds(admin)
  const res = await admin
    .from('exam_configs')
    .select('id, time_limit_seconds')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .eq('enabled', true)
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (res.error) fail('exam config lookup', res.error)
  if (!res.data) fail(`enabled exam config for subject ${subjectId}`, null)
  if (res.data.time_limit_seconds >= seconds) return
  const upd = await admin
    .from('exam_configs')
    .update({ time_limit_seconds: seconds })
    .eq('organization_id', orgId)
    .eq('id', res.data.id)
    .select('id')
  if (upd.error) fail('exam timer widen', upd.error)
  if ((upd.data ?? []).length === 0) fail(`exam timer widen: no row ${res.data.id}`, null)
  if (!widenedTimers.has(res.data.id)) widenedTimers.set(res.data.id, res.data.time_limit_seconds)
}

/** Restores every timer `widenExamTimer` changed. Safe to call with none. */
export async function restoreExamTimer(): Promise<void> {
  if (widenedTimers.size === 0) return
  const admin = getAdminClient()
  const errors: string[] = []
  const { orgId } = await adminIds(admin)
  for (const [id, seconds] of [...widenedTimers]) {
    const res = await admin
      .from('exam_configs')
      .update({ time_limit_seconds: seconds })
      .eq('organization_id', orgId)
      .eq('id', id)
      .select('id')
    if (res.error) {
      errors.push(`restore ${id}: ${res.error.message}`)
      continue
    }
    if ((res.data ?? []).length === 0) {
      errors.push(`restore: no row ${id}`)
      widenedTimers.delete(id)
      continue
    }
    widenedTimers.delete(id)
  }
  if (errors.length > 0) throw new Error(`${PREFIX} exam timer restore: ${errors.join('; ')}`)
}

/** Runs each cleanup step, collecting every error so one failing step never skips the others. */
export async function runCleanupSteps(steps: readonly (() => Promise<void>)[]): Promise<void> {
  const errors: string[] = []
  for (const step of steps) {
    try {
      await step()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
}
