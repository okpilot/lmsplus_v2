import { ADMIN_TEST_EMAIL } from './admin-supabase'
import { randomCode } from './code-gen'
import { makeSittingSeedMaterials } from './exam-sitting-markers'
import { getAdminClient } from './supabase'

const LEGACY_VALIDITY_MS = 24 * 3_600_000

/**
 * Last MILLISECOND of the scheduled UTC day: a JS `Date` carries no microseconds, so this lands
 * 999 µs before `private.sitting_code_expiry`, which is
 * `private.sitting_day_end(...) - interval '1 microsecond'`. Still inside the sitting day, which is
 * what matters — a fixed offset would seed a code that outlives its day, a state production cannot
 * produce.
 */
function codeExpiry(scheduledAt: Date): string {
  const end = new Date(scheduledAt)
  end.setUTCHours(23, 59, 59, 999)
  return end.toISOString()
}

type Admin = ReturnType<typeof getAdminClient>
type SeedStatus = 'scheduled' | 'open'
type Ids = {
  orgId: string
  adminId: string
  userId: string
  studentName: string
  subjectId: string
  courseId: string
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`sitting-code ${what}: ${error?.message ?? 'no data'}`)
}

async function lookupIds(admin: Admin, studentEmail: string, subjectFragment: string) {
  const adminRow = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', ADMIN_TEST_EMAIL)
    .is('deleted_at', null)
    .single()
  if (adminRow.error || !adminRow.data) fail('admin lookup', adminRow.error)
  const student = await admin
    .from('users')
    .select('id, full_name')
    .eq('organization_id', adminRow.data.organization_id)
    .eq('email', studentEmail)
    .is('deleted_at', null)
    .single()
  if (student.error || !student.data) fail('student lookup', student.error)
  const subject = await admin
    .from('easa_subjects')
    .select('id, course_id')
    .ilike('name', `%${subjectFragment}%`)
    .is('deleted_at', null)
    .order('name')
    .limit(1)
    .single()
  if (subject.error || !subject.data) fail('subject lookup', subject.error)
  // `issue_sitting_exam_codes` marks an entry issuable only when `config_ok`
  // (`private.sitting_issue_plan`, mig 20261116000800), and `start_internal_exam_session` raises
  // `exam_config_required`. The replaced admin-UI path sourced the subject from `exam_configs`
  // WHERE enabled, so a drifted seed failed here instead of inside a spec.
  const config = await admin
    .from('exam_configs')
    .select('id')
    .eq('organization_id', adminRow.data.organization_id)
    .eq('subject_id', subject.data.id)
    .eq('enabled', true)
    .is('deleted_at', null)
    .maybeSingle()
  if (config.error) fail('exam_config lookup', config.error)
  if (!config.data) fail(`enabled exam_config for subject ${subjectFragment}`, null)
  return {
    orgId: adminRow.data.organization_id,
    adminId: adminRow.data.id,
    userId: student.data.id,
    studentName: student.data.full_name ?? fail('student full_name (row locators need it)', null),
    subjectId: subject.data.id,
    courseId: subject.data.course_id,
  }
}

/**
 * Every enrolment `ensureEnrolment` inserted this run with tracking on, soft-deleted again by
 * `releaseSeededEnrolments`. Decision 38: a spec restores the shared seed data it mutates.
 *
 * Only enrolments that OUTLIVE the run belong here. A caller whose user is hard-deleted at teardown
 * passes `track: false`: `course_enrolments.user_id` is ON DELETE CASCADE (mig 20261027000100), so
 * the row is already gone.
 *
 * KNOWN LIMIT — in-process only, unlike the rest of this helper family: a worker killed between
 * the insert and teardown loses the ids and a fixture enrolment stays live. It is not DB-derivable:
 * `set_user_enrolments` also writes `enrolled_by` = the calling admin (mig 20261028000500), so no
 * predicate separates this row from an admin-UI enrolment of the same student. Bounded to one
 * fixture student on a local DB and cleared by `pnpm supabase db reset`; CI reseeds per run.
 */
const seededEnrolments = new Map<string, string>()

/** Soft-deletes the enrolments this run added that are still live. Safe to call with none. */
export async function releaseSeededEnrolments(): Promise<void> {
  if (seededEnrolments.size === 0) return
  const byOrg = new Map<string, string[]>()
  for (const [id, orgId] of seededEnrolments) byOrg.set(orgId, [...(byOrg.get(orgId) ?? []), id])
  const admin = getAdminClient()
  const errors: unknown[] = []
  for (const [orgId, ids] of byOrg) {
    try {
      const res = await admin
        .from('course_enrolments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .in('id', ids)
        .is('deleted_at', null)
        .select('id')
      if (res.error) fail('seeded enrolment release', res.error)
      // Zero rows is reachable without a fault: an admin unenrol or another spec can soft-delete the
      // same row first, and the restore is then already done. So this warns rather than throwing —
      // code-style.md §5 service-role-cleanup form. Warning on the EMPTY case, not the mutating one:
      // here a restore is the normal outcome, so logging it would print on every teardown.
      if ((res.data?.length ?? 0) === 0) {
        console.warn(
          `[releaseSeededEnrolments] no live row for ${ids.length} seeded id(s) in org ${orgId}`,
        )
      }
      // Forgotten only on success: `ensureEnrolment` skips an enrolment that is already live, so an
      // id dropped before a failed update leaves it live for good.
      for (const id of ids) seededEnrolments.delete(id)
    } catch (e) {
      errors.push(e)
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; '))
  }
}

/**
 * Enrols the user in the course unless already enrolled; `created` says whether this call inserted
 * the row. An inserted row is tracked for `releaseSeededEnrolments` unless `track` is false.
 */
export async function ensureEnrolment(
  admin: Admin,
  c: Pick<Ids, 'orgId' | 'adminId' | 'userId' | 'courseId'>,
  opts: { track?: boolean } = {},
): Promise<{ created: boolean; id: string }> {
  const existing = await admin
    .from('course_enrolments')
    .select('id')
    .eq('organization_id', c.orgId)
    .eq('user_id', c.userId)
    .eq('course_id', c.courseId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (existing.error) fail('enrolment lookup', existing.error)
  if (existing.data) return { created: false, id: existing.data.id }
  const res = await admin
    .from('course_enrolments')
    .insert({
      organization_id: c.orgId,
      user_id: c.userId,
      course_id: c.courseId,
      enrolled_by: c.adminId,
    })
    .select('id')
    .single()
  if (res.error || !res.data) fail('enrolment', res.error)
  if (opts.track !== false) seededEnrolments.set(res.data.id, c.orgId)
  return { created: true, id: res.data.id }
}

async function insertSitting(
  admin: Admin,
  c: Ids,
  opts: { status: SeedStatus; scheduledAt?: string },
): Promise<{ id: string; scheduledAt: string }> {
  const { status, scheduledAt } = opts
  const now = new Date().toISOString()
  const res = await admin
    .from('exam_sittings')
    .insert({
      organization_id: c.orgId,
      mode: 'remote',
      invigilator_id: c.adminId,
      created_by: c.adminId,
      scheduled_at: scheduledAt ?? now,
      permitted_materials: makeSittingSeedMaterials(),
      ...(status === 'open' ? { started_at: now, started_by: c.adminId } : {}),
    })
    .select('id')
    .single()
  if (res.error || !res.data) fail('sitting', res.error)
  return { id: res.data.id, scheduledAt: scheduledAt ?? now }
}

export type SeedSittingForInput = {
  studentEmail: string
  subjectFragment: string
  /** Default `open`. */
  status?: SeedStatus
  /** Default true; false leaves a no-code entry (issued later through the sitting page popup). */
  withCode?: boolean
  /** ISO instant for `scheduled_at`; default now. */
  scheduledAt?: string
}

/**
 * Service-role seed of a marked sitting holding an EXISTING student with one entry and, by default, a live code (no RPC).
 * `cleanupE2eExamSittings` removes the sitting, entry and code.
 * Known limit: by default the sitting is scheduled for `now`, and `list_my_active_internal_exam_codes` drops
 * the row once `private.sitting_day_ended(scheduled_at)` is true — a run that crosses UTC midnight
 * between the seed and the student's reload loses it.
 */
export async function seedSittingFor(
  input: SeedSittingForInput,
): Promise<{ code: string | null; sittingId: string; studentName: string }> {
  const admin = getAdminClient()
  const c = await lookupIds(admin, input.studentEmail, input.subjectFragment)
  await ensureEnrolment(admin, c)
  const sitting = await insertSitting(admin, c, {
    status: input.status ?? 'open',
    scheduledAt: input.scheduledAt,
  })
  const sittingId = sitting.id
  const cand = await admin
    .from('exam_sitting_candidates')
    .insert({ organization_id: c.orgId, sitting_id: sittingId, user_id: c.userId })
  if (cand.error) fail('candidate', cand.error)
  const entry = await admin
    .from('exam_sitting_entries')
    .insert({
      organization_id: c.orgId,
      sitting_id: sittingId,
      user_id: c.userId,
      subject_id: c.subjectId,
    })
    .select('id')
    .single()
  if (entry.error || !entry.data) fail('entry', entry.error)
  const code =
    input.withCode === false ? null : await insertCode(admin, c, entry.data.id, sitting.scheduledAt)
  return { code, sittingId, studentName: c.studentName }
}

async function insertCode(
  admin: Admin,
  c: Ids,
  entryId: string,
  scheduledAt: string,
): Promise<string> {
  const code = randomCode()
  const res = await admin.from('internal_exam_codes').insert({
    code,
    organization_id: c.orgId,
    issued_by: c.adminId,
    sitting_entry_id: entryId,
    student_id: c.userId,
    subject_id: c.subjectId,
    // The sitting's OWN day: a second clock read can land past midnight and outlive the sitting.
    expires_at: codeExpiry(new Date(scheduledAt)),
  })
  if (res.error) fail('code', res.error)
  return code
}

/** An open marked sitting holding the existing student with a live code. */
export async function issueSittingCodeFor(input: {
  studentEmail: string
  subjectFragment: string
}): Promise<{ code: string; sittingId: string }> {
  const { code, sittingId } = await seedSittingFor(input)
  if (code === null) throw new Error('issueSittingCodeFor: no code seeded')
  return { code, sittingId }
}

/** Service-role insert of a LEGACY code (no sitting entry) for the existing student; the caller soft-deletes it. */
export async function insertLegacyCodeFor(input: {
  studentEmail: string
  subjectFragment: string
}): Promise<string> {
  const admin = getAdminClient()
  const c = await lookupIds(admin, input.studentEmail, input.subjectFragment)
  const code = randomCode()
  const res = await admin.from('internal_exam_codes').insert({
    code,
    organization_id: c.orgId,
    issued_by: c.adminId,
    student_id: c.userId,
    subject_id: c.subjectId,
    // A legacy code is not a sitting code: `issue_internal_exam_code` gives it issued_at + 24h.
    expires_at: new Date(Date.now() + LEGACY_VALIDITY_MS).toISOString(),
  })
  if (res.error) fail('legacy code', res.error)
  return code
}
