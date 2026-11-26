import { randomUUID } from 'node:crypto'
import { randomCode } from './code-gen'
import {
  EXAM_SITTING_SEED_EMAIL_PREFIX,
  EXAM_SITTING_SEED_GROUP_PREFIX,
  makeSittingSeedMaterials,
} from './exam-sitting-markers'
import { getAdminClient } from './supabase'

/** The E2E admin (invigilator and creator of every seeded sitting). */
const ADMIN_EMAIL = 'admin@lmsplus.local'
const BATCH = 10

export type SeedEntryState = 'live' | 'no_code' | 'expired' | 'voided' | 'finished_passed'

export type SeedInput = {
  status?: 'scheduled' | 'open' | 'closed'
  /** `enrolled`: enrol a person without exams in the course of the first configured subject (so they can sit it). */
  people: { name: string; entries: { state: SeedEntryState }[]; enrolled?: boolean }[]
  /** Extra people without exams, named `E2E Extra NN`. */
  extraPeople?: number
  /** Students removed automatically because they passed: listed in the removed list. */
  autoRemoved?: { name: string }[]
  /** Students who are not candidates of the sitting (the Add people list), `e2e-sit-` emails. */
  addable?: { name: string; deactivated?: boolean }[]
  /** Student groups named `E2E-GRP-SIT-<name>`; `members` are names of people or addable people. */
  groups?: { name: string; members: string[] }[]
}

export type SeedResult = {
  sittingId: string
  people: { name: string; userId: string }[]
  addable: { name: string; userId: string }[]
  groups: { name: string; id: string }[]
  /** The subjects the sitting's exams are drawn from, configured subjects first. */
  subjects: Subject[]
}

type Admin = ReturnType<typeof getAdminClient>

function fail(what: string, error: { message: string } | null, prefix = 'seedSitting'): never {
  throw new Error(`${prefix} ${what}: ${error?.message ?? 'no data'}`)
}

/** A student with an `e2e-sit-` email (the sitting cleanup deletes it); `prefix` heads error messages. */
export async function createStudent(
  admin: Admin,
  orgId: string,
  name: string,
  prefix = 'seedSitting',
): Promise<string> {
  const email = `${EXAM_SITTING_SEED_EMAIL_PREFIX}${randomUUID()}@lmsplus.local`
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error || !data.user) fail('auth user', error, prefix)
  const id = data.user.id
  const row = { id, organization_id: orgId, email, full_name: name, role: 'student' }
  const res = await admin.from('users').insert(row)
  if (res.error) {
    // Roll the auth user back: cleanup finds seed students through their `users` row, so an
    // orphaned auth user is unreachable by teardown. deleteUser resolves `{ error }`.
    const { error: rollbackError } = await admin.auth.admin.deleteUser(id)
    throw new Error(
      `${prefix} users row: ${res.error.message}${rollbackError ? ` (rollback also failed: ${rollbackError.message})` : ''}`,
    )
  }
  return id
}

export async function createStudents(
  admin: Admin,
  orgId: string,
  names: string[],
  prefix = 'seedSitting',
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH)
    ids.push(...(await Promise.all(batch.map((n) => createStudent(admin, orgId, n, prefix)))))
  }
  return ids
}

/** `pass_mark` of the org's oldest enabled exam config for the subject. */
async function examPassMark(admin: Admin, orgId: string, subjectId: string): Promise<number> {
  const res = await admin
    .from('exam_configs')
    .select('pass_mark')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .eq('enabled', true)
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (res.error) fail('exam config lookup', res.error, 'insertPassedSession')
  if (!res.data) fail(`enabled exam config for subject ${subjectId}`, null, 'insertPassedSession')
  return res.data.pass_mark
}

/** A finished, passed internal-exam session with a score for a student and subject (service role, no code). */
export async function insertPassedSession(
  admin: Admin,
  c: { orgId: string; userId: string; subjectId: string; score: number; endedAt: Date },
): Promise<string> {
  const passMark = await examPassMark(admin, c.orgId, c.subjectId)
  const res = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: c.orgId,
      student_id: c.userId,
      mode: 'internal_exam',
      subject_id: c.subjectId,
      config: { pass_mark: passMark, question_ids: [] },
      total_questions: 0,
      started_at: new Date(c.endedAt.getTime() - 1_800_000).toISOString(),
      ended_at: c.endedAt.toISOString(),
      passed: true,
      score_percentage: c.score,
    })
    .select('id')
    .single()
  if (res.error || !res.data) fail('quiz session', res.error, 'insertPassedSession')
  return res.data.id
}

const endOfTodayUtc = () => `${new Date().toISOString().slice(0, 10)}T23:59:59.000Z`

async function seedCode(
  admin: Admin,
  c: { orgId: string; adminId: string; entryId: string; userId: string; subjectId: string },
  state: SeedEntryState,
): Promise<void> {
  if (state === 'no_code') return
  const now = Date.now()
  const base: Record<string, unknown> = {
    code: randomCode(),
    organization_id: c.orgId,
    issued_by: c.adminId,
    sitting_entry_id: c.entryId,
    student_id: c.userId,
    subject_id: c.subjectId,
    expires_at: state === 'expired' ? new Date(now - 3_600_000).toISOString() : endOfTodayUtc(),
  }
  if (state === 'voided') {
    Object.assign(base, {
      voided_at: new Date().toISOString(),
      voided_by: c.adminId,
      void_reason: 'manual',
    })
  }
  if (state === 'finished_passed') {
    const sessionId = await insertPassedSession(admin, {
      orgId: c.orgId,
      userId: c.userId,
      subjectId: c.subjectId,
      score: 90,
      endedAt: new Date(now - 1_800_000),
    })
    Object.assign(base, {
      consumed_at: new Date().toISOString(),
      consumed_session_id: sessionId,
    })
  }
  const res = await admin.from('internal_exam_codes').insert(base)
  if (res.error) fail('code', res.error)
}

export type Subject = { id: string; short: string; course_id: string }

async function seedEntries(
  admin: Admin,
  ctx: { orgId: string; adminId: string; sittingId: string; subjects: Subject[] },
  userId: string,
  states: SeedEntryState[],
): Promise<void> {
  if (states.length === 0) return
  const rows = states.map((_, i) => ({
    organization_id: ctx.orgId,
    sitting_id: ctx.sittingId,
    user_id: userId,
    subject_id: (ctx.subjects[i % ctx.subjects.length] as Subject).id,
  }))
  const courseIds = [
    ...new Set(states.map((_, i) => (ctx.subjects[i % ctx.subjects.length] as Subject).course_id)),
  ]
  const enrol = await admin.from('course_enrolments').insert(
    courseIds.map((course_id) => ({
      organization_id: ctx.orgId,
      user_id: userId,
      course_id,
      enrolled_by: ctx.adminId,
    })),
  )
  if (enrol.error) fail('enrolments', enrol.error)
  // PostgREST does not guarantee that returned rows keep input order, so pair them by subject_id
  // (unique per insert: a repeat would violate the live (sitting, user, subject) unique index).
  const res = await admin.from('exam_sitting_entries').insert(rows).select('id, subject_id')
  if (res.error) fail('entries', res.error)
  const bySubject = new Map<string, string>()
  for (const r of (res.data ?? []) as { id: string; subject_id: string }[])
    bySubject.set(r.subject_id, r.id)
  for (const [i, state] of states.entries()) {
    const subjectId = (rows[i] as { subject_id: string }).subject_id
    const entryId = bySubject.get(subjectId)
    if (!entryId) fail(`entry id for subject ${subjectId}`, null)
    await seedCode(admin, { ...ctx, entryId, userId, subjectId }, state)
  }
}

/** Passed entries the prune path auto-removed. The `audit_events` rows it writes are immutable, so
 * teardown cannot remove them while the parent sitting is hard-deleted: each run leaves orphan
 * audit rows in the local and CI databases. */
async function seedAutoRemoved(
  admin: Admin,
  ctx: { orgId: string; adminId: string; sittingId: string; subjects: Subject[] },
  names: string[],
): Promise<void> {
  const ids = await createStudents(admin, ctx.orgId, names)
  const rows = ids.map((userId) => ({
    organization_id: ctx.orgId,
    resource_id: ctx.sittingId,
    resource_type: 'exam_sitting',
    event_type: 'exam_sitting.entry_auto_removed',
    actor_id: ctx.adminId,
    actor_role: 'admin',
    metadata: {
      entry_id: randomUUID(),
      user_id: userId,
      subject_id: ctx.subjects[0]?.id,
      passed_at: new Date().toISOString(),
    },
  }))
  if (rows.length === 0) return
  const res = await admin.from('audit_events').insert(rows)
  if (res.error) fail('audit events', res.error)
}

async function enrolInCourse(
  admin: Admin,
  c: { orgId: string; adminId: string; userId: string; courseId: string },
): Promise<void> {
  const res = await admin.from('course_enrolments').insert({
    organization_id: c.orgId,
    user_id: c.userId,
    course_id: c.courseId,
    enrolled_by: c.adminId,
  })
  if (res.error) fail('enrolment', res.error)
}

async function seedAddable(
  admin: Admin,
  orgId: string,
  list: { name: string; deactivated?: boolean }[],
): Promise<{ name: string; userId: string }[]> {
  const ids = await createStudents(
    admin,
    orgId,
    list.map((p) => p.name),
  )
  const dead = ids.filter((_, i) => list[i]?.deactivated)
  if (dead.length > 0) {
    const res = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', dead)
    if (res.error) fail('deactivate', res.error)
  }
  return list.map((p, i) => ({ name: p.name, userId: ids[i] as string }))
}

async function seedGroups(
  admin: Admin,
  c: { orgId: string; adminId: string; byName: Map<string, string> },
  groups: { name: string; members: string[] }[],
): Promise<{ name: string; id: string }[]> {
  const out: { name: string; id: string }[] = []
  for (const g of groups) {
    const name = `${EXAM_SITTING_SEED_GROUP_PREFIX}${g.name}`
    const row = await admin
      .from('student_groups')
      .insert({ organization_id: c.orgId, name, created_by: c.adminId })
      .select('id')
      .single()
    if (row.error || !row.data) fail('group', row.error)
    const members = g.members.map((m) => {
      const userId = c.byName.get(m)
      if (!userId) throw new Error(`seedSitting group ${g.name}: unknown member ${m}`)
      return { organization_id: c.orgId, group_id: row.data.id, user_id: userId }
    })
    const res =
      members.length > 0 ? await admin.from('student_group_members').insert(members) : null
    if (res?.error) fail('group members', res.error)
    out.push({ name, id: row.data.id })
  }
  return out
}

/**
 * Service-role seed of one marked sitting with people, entries and codes (no RPC, no email).
 * Every sitting and user it creates carries a marker that `cleanupE2eExamSittings` removes.
 */
export async function seedSitting(input: SeedInput): Promise<SeedResult> {
  const admin = getAdminClient()
  const adminRow = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', ADMIN_EMAIL)
    .single()
  if (adminRow.error || !adminRow.data) fail('admin lookup', adminRow.error)
  const { id: adminId, organization_id: orgId } = adminRow.data
  const subjectRes = await admin
    .from('easa_subjects')
    .select('id, short, course_id')
    .is('deleted_at', null)
    .order('short')
  if (subjectRes.error || !subjectRes.data?.length) fail('subjects', subjectRes.error)
  const configs = await admin
    .from('exam_configs')
    .select('subject_id')
    .eq('organization_id', orgId)
    .eq('enabled', true)
    .is('deleted_at', null)
  if (configs.error) fail('exam configs', configs.error)
  const configured = new Set((configs.data ?? []).map((c) => c.subject_id))
  // Subjects with an exam config first: only those can be issued a code.
  const subjects = [...(subjectRes.data as Subject[])]
    .sort((a, b) => Number(configured.has(b.id)) - Number(configured.has(a.id)))
    .slice(0, 12)

  const status = input.status ?? 'scheduled'
  const now = new Date().toISOString()
  const sitting = await admin
    .from('exam_sittings')
    .insert({
      organization_id: orgId,
      mode: 'remote',
      invigilator_id: adminId,
      created_by: adminId,
      scheduled_at: now,
      permitted_materials: makeSittingSeedMaterials(),
      ...(status !== 'scheduled' ? { started_at: now, started_by: adminId } : {}),
      ...(status === 'closed' ? { closed_at: now, closed_by: adminId } : {}),
    })
    .select('id')
    .single()
  if (sitting.error || !sitting.data) fail('sitting', sitting.error)
  const sittingId = sitting.data.id

  const extra = Array.from(
    { length: input.extraPeople ?? 0 },
    (_, i) => `E2E Extra ${String(i + 1).padStart(2, '0')}`,
  )
  const names = [...input.people.map((p) => p.name), ...extra]
  const userIds = await createStudents(admin, orgId, names)
  const cands = await admin
    .from('exam_sitting_candidates')
    .insert(userIds.map((u) => ({ organization_id: orgId, sitting_id: sittingId, user_id: u })))
  if (cands.error) fail('candidates', cands.error)

  const ctx = { orgId, adminId, sittingId, subjects }
  for (const [i, p] of input.people.entries()) {
    const userId = userIds[i] as string
    await seedEntries(
      admin,
      ctx,
      userId,
      p.entries.map((e) => e.state),
    )
    if (p.enrolled && p.entries.length === 0) {
      const courseId = (subjects[0] as Subject).course_id
      await enrolInCourse(admin, { orgId, adminId, userId, courseId })
    }
  }
  await seedAutoRemoved(
    admin,
    ctx,
    (input.autoRemoved ?? []).map((p) => p.name),
  )
  const people = input.people.map((p, i) => ({ name: p.name, userId: userIds[i] as string }))
  const addable = await seedAddable(admin, orgId, input.addable ?? [])
  const byName = new Map([...people, ...addable].map((p) => [p.name, p.userId]))
  const groups = await seedGroups(admin, { orgId, adminId, byName }, input.groups ?? [])
  return { sittingId, people, addable, groups, subjects }
}
