import { randomUUID } from 'node:crypto'
import { randomCode } from './code-gen'
import { EXAM_SITTING_SEED_PREFIX } from './exam-sitting-markers'
import { getAdminClient } from './supabase'

const ADMIN_EMAIL = 'admin@lmsplus.local'
const EXPIRY_MS = 6 * 3_600_000

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
  throw new Error(`issueSittingCodeFor ${what}: ${error?.message ?? 'no data'}`)
}

async function lookupIds(admin: Admin, studentEmail: string, subjectFragment: string) {
  const adminRow = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', ADMIN_EMAIL)
    .single()
  if (adminRow.error || !adminRow.data) fail('admin lookup', adminRow.error)
  const student = await admin
    .from('users')
    .select('id, full_name')
    .eq('email', studentEmail)
    .single()
  if (student.error || !student.data) fail('student lookup', student.error)
  const subject = await admin
    .from('easa_subjects')
    .select('id, course_id')
    .ilike('name', `%${subjectFragment}%`)
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (subject.error || !subject.data) fail('subject lookup', subject.error)
  return {
    orgId: adminRow.data.organization_id,
    adminId: adminRow.data.id,
    userId: student.data.id,
    studentName: student.data.full_name ?? '',
    subjectId: subject.data.id,
    courseId: subject.data.course_id,
  }
}

/** Enrols the user in the course unless already enrolled; `created` says whether this call inserted the row. */
export async function ensureEnrolment(
  admin: Admin,
  c: { orgId: string; adminId: string; userId: string; courseId: string },
): Promise<{ created: boolean; id: string }> {
  const existing = await admin
    .from('course_enrolments')
    .select('id')
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
  return { created: true, id: res.data.id }
}

async function insertSitting(
  admin: Admin,
  c: Ids,
  opts: { status: SeedStatus; scheduledAt?: string },
): Promise<string> {
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
      permitted_materials: `${EXAM_SITTING_SEED_PREFIX}${randomUUID()}`,
      ...(status === 'open' ? { started_at: now, started_by: c.adminId } : {}),
    })
    .select('id')
    .single()
  if (res.error || !res.data) fail('sitting', res.error)
  return res.data.id
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
 */
export async function seedSittingFor(
  input: SeedSittingForInput,
): Promise<{ code: string | null; sittingId: string; studentName: string }> {
  const admin = getAdminClient()
  const c = await lookupIds(admin, input.studentEmail, input.subjectFragment)
  await ensureEnrolment(admin, c)
  const sittingId = await insertSitting(admin, c, {
    status: input.status ?? 'open',
    scheduledAt: input.scheduledAt,
  })
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
  const code = input.withCode === false ? null : await insertCode(admin, c, entry.data.id)
  return { code, sittingId, studentName: c.studentName }
}

async function insertCode(admin: Admin, c: Ids, entryId: string): Promise<string> {
  const code = randomCode()
  const res = await admin.from('internal_exam_codes').insert({
    code,
    organization_id: c.orgId,
    issued_by: c.adminId,
    sitting_entry_id: entryId,
    student_id: c.userId,
    subject_id: c.subjectId,
    expires_at: new Date(Date.now() + EXPIRY_MS).toISOString(),
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
    expires_at: new Date(Date.now() + EXPIRY_MS).toISOString(),
  })
  if (res.error) fail('legacy code', res.error)
  return code
}
