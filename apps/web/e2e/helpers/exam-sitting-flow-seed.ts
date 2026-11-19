import { createStudents } from './exam-sitting-seed'
import { ensureEnrolment } from './sitting-code'
import { getAdminClient } from './supabase'

const ADMIN_EMAIL = 'admin@lmsplus.local'
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

/** Students with an `e2e-sit-` email (the sitting cleanup deletes them), enrolled in `courseId`. */
export async function seedEnrolledStudents(
  names: string[],
  courseId: string,
): Promise<{ name: string; userId: string }[]> {
  const admin = getAdminClient()
  const { adminId, orgId } = await adminIds(admin)
  const ids = await createStudents(admin, orgId, names, PREFIX)
  for (const userId of ids) await ensureEnrolment(admin, { orgId, adminId, userId, courseId })
  return names.map((name, i) => ({ name, userId: ids[i] as string }))
}

/** Soft-deletes one enrolment a spec created; throws when no live row matched. A null id is a no-op. */
export async function softDeleteEnrolment(id: string | null): Promise<void> {
  if (id === null) return
  const res = await getAdminClient()
    .from('course_enrolments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
  if (res.error) fail('enrolment soft-delete', res.error)
  if ((res.data ?? []).length === 0)
    fail('enrolment soft-delete', { message: `no enrolment ${id}` })
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
