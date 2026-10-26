import type { SupabaseClient } from '@supabase/supabase-js'

/** PPL_A + VFR_RT: the courses every pre-enforcement student was grandfathered into. */
export const GRANDFATHER_COURSE_IDS = [
  'c0a5e000-0000-4000-8000-000000000001',
  'c0a5e000-0000-4000-8000-000000000002',
] as const

/**
 * Service-role helper for seeds and tests: gives `userId` an active enrolment in each course
 * (default: the grandfather set). Probe-then-insert — the partial unique index
 * `(user_id, course_id) WHERE deleted_at IS NULL` has no PostgREST `onConflict` target.
 * `orgId` defaults to the user's own organisation. Students only; callers skip other roles.
 */
export async function enrolStudent(
  admin: SupabaseClient,
  opts: { userId: string; orgId?: string; courseIds?: readonly string[] },
): Promise<void> {
  const courseIds = opts.courseIds ?? GRANDFATHER_COURSE_IDS
  if (courseIds.length === 0) return

  let orgId = opts.orgId
  if (!orgId) {
    const { data, error } = await admin
      .from('users')
      .select('organization_id')
      .eq('id', opts.userId)
      .single()
    if (error || !data) throw new Error(`enrolStudent org lookup: ${error?.message}`)
    orgId = data.organization_id as string
  }

  const { data: active, error: probeErr } = await admin
    .from('course_enrolments')
    .select('course_id')
    .eq('user_id', opts.userId)
    .is('deleted_at', null)
    .in('course_id', [...courseIds])
  if (probeErr) throw new Error(`enrolStudent probe: ${probeErr.message}`)

  const have = new Set((active ?? []).map((r) => r.course_id as string))
  const rows = courseIds
    .filter((c) => !have.has(c))
    .map((course_id) => ({ organization_id: orgId, user_id: opts.userId, course_id }))
  if (rows.length === 0) return

  const { error } = await admin.from('course_enrolments').insert(rows)
  // 23505: a concurrent caller enrolled the same course between probe and insert.
  if (error && error.code !== '23505') throw new Error(`enrolStudent insert: ${error.message}`)
}
