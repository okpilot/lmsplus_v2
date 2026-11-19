import { randomUUID } from 'node:crypto'
import { EXAM_SITTING_SEED_EMAIL_PREFIX, EXAM_SITTING_SEED_PREFIX } from './exam-sitting-markers'
import { getAdminClient } from './supabase'

const ADMIN_EMAIL = 'admin@lmsplus.local'

type Admin = ReturnType<typeof getAdminClient>

export type FlowSubject = { id: string; short: string; name: string; courseId: string }

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`exam-sitting-flow-seed ${what}: ${error?.message ?? 'no data'}`)
}

async function adminIds(admin: Admin): Promise<{ adminId: string; orgId: string }> {
  const row = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', ADMIN_EMAIL)
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
    .limit(1)
    .single()
  if (res.error || !res.data) fail(`subject ${fragment}`, res.error)
  return {
    id: res.data.id,
    short: res.data.short ?? '',
    name: res.data.name,
    courseId: res.data.course_id,
  }
}

/** The subject `seedSitting` gives its first exam: configured subjects first, then by short. */
export async function firstSeedSubject(): Promise<FlowSubject> {
  const admin = getAdminClient()
  const { orgId } = await adminIds(admin)
  const subjects = await admin
    .from('easa_subjects')
    .select('id, short, name, course_id')
    .is('deleted_at', null)
    .order('short')
  if (subjects.error || !subjects.data?.length) fail('subjects', subjects.error)
  const configs = await admin
    .from('exam_configs')
    .select('subject_id')
    .eq('organization_id', orgId)
    .eq('enabled', true)
    .is('deleted_at', null)
  if (configs.error) fail('exam configs', configs.error)
  const configured = new Set((configs.data ?? []).map((c) => c.subject_id))
  const sorted = [...subjects.data].sort(
    (a, b) => Number(configured.has(b.id)) - Number(configured.has(a.id)),
  )
  const s = sorted[0]
  if (!s) fail('first subject', null)
  return { id: s.id, short: s.short ?? '', name: s.name, courseId: s.course_id }
}

/** Enrols the user in the subject's course unless already enrolled. */
export async function ensureEnrolled(userId: string, courseId: string): Promise<void> {
  const admin = getAdminClient()
  const { adminId, orgId } = await adminIds(admin)
  const existing = await admin
    .from('course_enrolments')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (existing.error) fail('enrolment lookup', existing.error)
  if (existing.data) return
  const res = await admin.from('course_enrolments').insert({
    organization_id: orgId,
    user_id: userId,
    course_id: courseId,
    enrolled_by: adminId,
  })
  if (res.error) fail('enrolment', res.error)
}

/** Students with an `e2e-sit-` email (the sitting cleanup deletes them), enrolled in `courseId`. */
export async function seedEnrolledStudents(
  names: string[],
  courseId: string,
): Promise<{ name: string; userId: string }[]> {
  const admin = getAdminClient()
  const { orgId } = await adminIds(admin)
  const out: { name: string; userId: string }[] = []
  for (const name of names) {
    const email = `${EXAM_SITTING_SEED_EMAIL_PREFIX}${randomUUID()}@lmsplus.local`
    const created = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (created.error || !created.data.user) fail('auth user', created.error)
    const userId = created.data.user.id
    const row = await admin
      .from('users')
      .insert({ id: userId, organization_id: orgId, email, full_name: name, role: 'student' })
    if (row.error) fail('users row', row.error)
    await ensureEnrolled(userId, courseId)
    out.push({ name, userId })
  }
  return out
}

/** Re-marks a sitting made through the UI so `cleanupE2eExamSittings` removes it with its people and codes. */
export async function claimSittingForCleanup(sittingId: string): Promise<void> {
  const res = await getAdminClient()
    .from('exam_sittings')
    .update({ permitted_materials: `${EXAM_SITTING_SEED_PREFIX}${randomUUID()}` })
    .eq('id', sittingId)
    .select('id')
  if (res.error) fail('claim sitting', res.error)
  if ((res.data ?? []).length === 0) fail('claim sitting', { message: `no sitting ${sittingId}` })
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
  const entries = await admin.from('exam_sitting_entries').select('id').eq('sitting_id', sittingId)
  if (entries.error) fail('entries', entries.error)
  const ids = (entries.data ?? []).map((e) => e.id)
  if (ids.length === 0) return []
  const codes = await admin
    .from('internal_exam_codes')
    .select('code, student_id, voided_at, void_reason')
    .in('sitting_entry_id', ids)
  if (codes.error) fail('codes', codes.error)
  return (codes.data ?? []).map((c) => ({
    code: c.code,
    userId: c.student_id,
    voided: c.voided_at !== null,
    voidReason: c.void_reason,
  }))
}

/** A finished, passed internal-exam session with a score for a student and subject (service role, no code). */
export async function seedPassedAttempt(input: {
  userId: string
  subjectId: string
  score: number
}): Promise<{ sessionId: string; endedAt: Date }> {
  const admin = getAdminClient()
  const { orgId } = await adminIds(admin)
  const endedAt = new Date(Date.now() - 1_800_000)
  const res = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: input.userId,
      mode: 'internal_exam',
      subject_id: input.subjectId,
      config: { pass_mark: 75, question_ids: [] },
      total_questions: 0,
      started_at: new Date(endedAt.getTime() - 1_800_000).toISOString(),
      ended_at: endedAt.toISOString(),
      passed: true,
      score_percentage: input.score,
    })
    .select('id')
    .single()
  if (res.error || !res.data) fail('passed attempt', res.error)
  return { sessionId: res.data.id, endedAt }
}

/** Deletes seeded passed sessions (they reference seeded students that the sitting cleanup deletes next). */
export async function deleteSeededSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return
  const res = await getAdminClient().from('quiz_sessions').delete().in('id', sessionIds)
  if (res.error) fail('delete sessions', res.error)
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
