import { spawnSync } from 'node:child_process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { enrolStudent } from '../enrol-students'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

const admin = getAdminClient()
const PW = 'test-pass-123'
const DAY = 86_400_000
const BAD = '00000000-0000-4000-a000-0000000000ff'

/** UTC midnight of today + offset days. */
const dayStart = (offset = 0) => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() + offset * DAY)
}
const at = (offset: number, hour = 9) =>
  new Date(dayStart(offset).getTime() + hour * 3_600_000).toISOString()
/** Last microsecond of the UTC day `offset` days from today (ms precision floor of day_end - 1us). */
const dayEndMinus1us = (offset: number) => dayStart(offset + 1).getTime() - 1

type DbErr = { message: string; code?: string } | null
type Res = { data: unknown; error: DbErr }
const must = <T = Record<string, unknown>[]>(
  r: { data: unknown; error: DbErr },
  label: string,
): T => {
  expect(r.error, label).toBeNull()
  return r.data as T
}
const rowOf = (data: unknown): Record<string, unknown> =>
  (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
const errOf = (r: Res) => r.error?.message
const expectToken = (r: Res, token: string) => {
  expect(r.error?.message).toBe(token)
}

/** psql as postgres: host psql, else the supabase db container. */
function psql(sql: string): { out: string; err: string } {
  const args = ['-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1']
  let r = spawnSync('psql', ['-h', 'localhost', '-p', '54322', ...args], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  })
  if (r.error) {
    r = spawnSync('docker', ['exec', '-i', 'supabase_db_lmsplusv2', 'psql', ...args], {
      input: sql,
      encoding: 'utf8',
    })
  }
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

type SittingState = 'scheduled' | 'open' | 'closed' | 'cancelled'

async function buildWorld(tag: string) {
  // One namespace per world: seedReferenceData upserts on code, so a shared suffix would alias subjects across worlds.
  const suffix = fixtureSuffix()
  const orgA = await createTestOrg({
    admin,
    name: `${tag} A ${suffix}`,
    slug: `${tag}-a-${suffix}`,
  })
  const orgB = await createTestOrg({
    admin,
    name: `${tag} B ${suffix}`,
    slug: `${tag}-b-${suffix}`,
  })
  const userIds: string[] = []
  const bUserIds: string[] = []
  const emails: Record<string, string> = {}
  const mk = async (
    org: string,
    t: string,
    role: 'admin' | 'instructor' | 'student',
    ids: string[],
  ) => {
    const email = `${tag}-${t}-${suffix}@test.local`
    emails[t] = email
    const id = await createTestUser({
      admin,
      orgId: org,
      email,
      password: PW,
      role,
      fullName: `${t} ${suffix}`,
    })
    ids.push(id)
    return id
  }
  const a1 = await mk(orgA, 'a1', 'admin', userIds)
  const i1 = await mk(orgA, 'i1', 'instructor', userIds)
  const s1 = await mk(orgA, 's1', 'student', userIds)
  const s2 = await mk(orgA, 's2', 'student', userIds)
  const s3 = await mk(orgA, 's3', 'student', userIds)
  const s4 = await mk(orgA, 's4', 'student', userIds)
  const b1 = await mk(orgB, 'b1', 'admin', bUserIds)
  const bs1 = await mk(orgB, 'bs1', 'student', bUserIds)
  const login = (t: string) => getAuthenticatedClient({ email: emails[t] as string, password: PW })
  const clients = {
    a1: await login('a1'),
    i1: await login('i1'),
    s1: await login('s1'),
    s2: await login('s2'),
    b1: await login('b1'),
    anon: getAnonClient(),
  }
  const refs = await seedReferenceData({
    admin,
    subjectCode: `SA${suffix}`,
    subjectName: `Sit A ${suffix}`,
    topicCode: `SA${suffix}-01`,
    topicName: `Sit A Topic ${suffix}`,
  })
  const refsB = await seedReferenceData({
    admin,
    subjectCode: `SB${suffix}`,
    subjectName: `Sit B ${suffix}`,
    topicCode: `SB${suffix}-01`,
    topicName: `Sit B Topic ${suffix}`,
  })
  const subA = refs.subjectId
  const subB = refsB.subjectId
  for (const subject_id of [subA, subB]) {
    const r = await admin.from('exam_configs').insert({
      organization_id: orgA,
      subject_id,
      enabled: true,
      total_questions: 10,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (r.error) throw new Error(`exam_configs: ${r.error.message}`)
  }
  let n = 0
  const world = {
    orgA,
    orgB,
    a1,
    i1,
    s1,
    s2,
    s3,
    s4,
    b1,
    bs1,
    subA,
    subB,
    clients,
    userIds,
    bUserIds,
    async teardown() {
      await cleanupTestData({ admin, orgId: orgA, userIds })
      await cleanupTestData({ admin, orgId: orgB, userIds: bUserIds })
      await cleanupReferenceData({ admin, refs: [refs, refsB] })
    },
    /** Service-role seeded sitting. day = UTC day offset from today (negative = past). */
    async sitting(
      o: {
        day?: number
        hour?: number
        state?: SittingState
        mode?: 'remote' | 'in_person'
        invigilator?: string
        org?: string
        creator?: string
        materials?: string | null
      } = {},
    ): Promise<string> {
      const state = o.state ?? 'scheduled'
      const org = o.org ?? orgA
      const scheduled = at(o.day ?? 1, o.hour ?? 9)
      const startedMs = Math.min(Date.now() - 2000, new Date(scheduled).getTime())
      const creator = o.creator ?? (org === orgA ? a1 : b1)
      const row: Record<string, unknown> = {
        organization_id: org,
        scheduled_at: scheduled,
        mode: o.mode ?? 'remote',
        invigilator_id: o.invigilator ?? creator,
        permitted_materials: o.materials ?? null,
        created_by: creator,
      }
      if (state === 'open' || state === 'closed') {
        row.started_at = new Date(startedMs).toISOString()
        row.started_by = creator
      }
      if (state === 'closed') {
        row.closed_at = new Date(startedMs + 1000).toISOString()
        row.closed_by = creator
      }
      if (state === 'cancelled') {
        row.deleted_at = new Date().toISOString()
        row.deleted_by = creator
      }
      const r = await admin.from('exam_sittings').insert(row).select('id').single()
      return must<{ id: string }>(r, 'seed sitting').id
    },
    async candidate(sittingId: string, userId: string, org = orgA): Promise<string> {
      const r = await admin
        .from('exam_sitting_candidates')
        .insert({ organization_id: org, sitting_id: sittingId, user_id: userId })
        .select('id')
        .single()
      return must<{ id: string }>(r, 'seed candidate').id
    },
    async entry(sittingId: string, userId: string, subjectId: string, org = orgA): Promise<string> {
      const r = await admin
        .from('exam_sitting_entries')
        .insert({
          organization_id: org,
          sitting_id: sittingId,
          user_id: userId,
          subject_id: subjectId,
        })
        .select('id')
        .single()
      return must<{ id: string }>(r, 'seed entry').id
    },
    /** Candidate + entry in one go. */
    async enter(sittingId: string, userId: string, subjectId: string): Promise<string> {
      const c = await admin
        .from('exam_sitting_candidates')
        .select('id')
        .eq('sitting_id', sittingId)
        .eq('user_id', userId)
        .is('deleted_at', null)
      if (!c.data?.length) await world.candidate(sittingId, userId)
      return world.entry(sittingId, userId, subjectId)
    },
    async code(
      entryId: string,
      o: {
        emailed?: boolean
        expired?: boolean
        voided?: boolean
        consumedBy?: string
        expiresAt?: string
      } = {},
    ): Promise<string> {
      const e = must<{ organization_id: string; user_id: string; subject_id: string }>(
        await admin
          .from('exam_sitting_entries')
          .select('organization_id, user_id, subject_id')
          .eq('id', entryId)
          .single(),
        'entry lookup',
      )
      const row: Record<string, unknown> = {
        code: `SC${suffix}${++n}`,
        subject_id: e.subject_id,
        student_id: e.user_id,
        issued_by: a1,
        organization_id: e.organization_id,
        sitting_entry_id: entryId,
        expires_at:
          o.expiresAt ?? new Date(Date.now() + (o.expired ? -3_600_000 : 7_200_000)).toISOString(),
      }
      if (o.emailed) row.emailed_at = new Date().toISOString()
      if (o.voided) {
        row.voided_at = new Date().toISOString()
        row.voided_by = a1
        row.void_reason = 'manual'
      }
      if (o.consumedBy) {
        row.consumed_at = new Date().toISOString()
        row.consumed_session_id = o.consumedBy
      }
      const r = await admin.from('internal_exam_codes').insert(row).select('id').single()
      return must<{ id: string }>(r, 'seed code').id
    },
    async session(
      studentId: string,
      subjectId: string,
      o: { ended?: boolean; passed?: boolean | null } = {},
    ): Promise<string> {
      const r = await admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgA,
          student_id: studentId,
          mode: 'internal_exam',
          subject_id: subjectId,
          config: { pass_mark: 75, question_ids: [] },
          total_questions: 0,
          started_at: new Date(Date.now() - 3_600_000).toISOString(),
          ended_at: o.ended === false ? null : new Date(Date.now() - 1_800_000).toISOString(),
          passed: o.passed ?? null,
        })
        .select('id')
        .single()
      return must<{ id: string }>(r, 'seed session').id
    },
    /** Soft-delete every live session in org A so no active or passed session leaks between cases. */
    async resetSessions() {
      must(
        await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('organization_id', orgA)
          .is('deleted_at', null)
          .select('id'),
        'reset sessions',
      )
    },
    async audits(type: string, resourceId?: string) {
      let q = admin
        .from('audit_events')
        .select('actor_id, actor_role, resource_id, metadata')
        .eq('event_type', type)
        .eq('organization_id', orgA)
      if (resourceId) q = q.eq('resource_id', resourceId)
      return must<
        Array<{
          actor_id: string
          actor_role: string
          resource_id: string
          metadata: Record<string, unknown>
        }>
      >(await q, `audits ${type}`)
    },
    async sittingRow(id: string) {
      return must<Record<string, unknown>>(
        await admin.from('exam_sittings').select('*').eq('id', id).single(),
        'sitting row',
      )
    },
    async codeRow(id: string) {
      return must<Record<string, unknown>>(
        await admin.from('internal_exam_codes').select('*').eq('id', id).single(),
        'code row',
      )
    },
    async group(name: string, members: string[], org = orgA): Promise<string> {
      const g = await admin
        .from('student_groups')
        .insert({
          organization_id: org,
          name: `${name}-${suffix}`,
          created_by: org === orgA ? a1 : b1,
        })
        .select('id')
        .single()
      const id = must<{ id: string }>(g, 'seed group').id
      if (members.length) {
        must(
          await admin
            .from('student_group_members')
            .insert(members.map((user_id) => ({ organization_id: org, group_id: id, user_id }))),
          'seed members',
        )
      }
      return id
    },
    async setUser(id: string, patch: Record<string, unknown>) {
      must(await admin.from('users').update(patch).eq('id', id).select('id'), 'user patch')
    },
  }
  return world
}
// Referenced so unused-helper lint does not fire in files that use a subset.
void [errOf, expectToken, rowOf, dayEndMinus1us, psql, BAD, it, describe, afterAll, beforeAll]

type World = Awaited<ReturnType<typeof buildWorld>>
const arr = (a: string[]) => `ARRAY[${a.map((x) => `'${x}'`).join(',')}]::uuid[]`
const now = () => new Date().toISOString()
const unenrol = async (id: string) => {
  must(
    await admin
      .from('course_enrolments')
      .update({ deleted_at: now() })
      .eq('user_id', id)
      .is('deleted_at', null)
      .select('id'),
    'unenrol',
  )
}
const deactivate = async (w: World, id: string) => w.setUser(id, { deleted_at: now() })
/** Back to the baseline: students active and enrolled, no live sessions. */
async function restore(w: World) {
  await w.resetSessions()
  for (const id of [w.s1, w.s2, w.s3, w.s4]) {
    await w.setUser(id, { deleted_at: null })
    await enrolStudent(admin, { userId: id, orgId: w.orgA })
  }
}
/** Ended session with a score; passed = true gives 90, false gives 40. */
async function scored(w: World, student: string, subject: string, passed: boolean) {
  const id = await w.session(student, subject, { ended: true, passed })
  must(
    await admin
      .from('quiz_sessions')
      .update({ score_percentage: passed ? 90 : 40 })
      .eq('id', id)
      .select('id'),
    'score',
  )
  return id
}
const rows = <T = Record<string, unknown>>(r: Res) => must<T[]>(r, 'rows')
const countOf = async (table: string, org: string, sit: string, live = true) => {
  let q = admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org)
    .eq('sitting_id', sit)
  if (live) q = q.is('deleted_at', null)
  const r = await q
  expect(r.error).toBeNull()
  return r.count ?? 0
}
const auditCount = async (org: string, type: string, sit: string) => {
  const r = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org)
    .eq('event_type', type)
    .eq('resource_id', sit)
  expect(r.error).toBeNull()
  return r.count ?? 0
}
void [arr, now, unenrol, deactivate, restore, scored, rows, countOf, auditCount]

const PPL_A = 'c0a5e000-0000-4000-8000-000000000001'
/** n enrolled org A students inserted by psql (fast); returns their ids. */
function bulkUsers(w: World, n: number, tag: string): string[] {
  const ids = Array.from({ length: n }, () => crypto.randomUUID())
  const values = ids
    .map((id, i) => `('${id}', '${tag}${i}-${fixtureSuffix()}@test.local')`)
    .join(',')
  const r = psql(
    `INSERT INTO auth.users (id, instance_id, aud, role, email) SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email FROM (VALUES ${values}) AS v(id, email);
     INSERT INTO public.users (id, organization_id, email, full_name, role) SELECT v.id::uuid, '${w.orgA}', v.email, 'bulk ' || v.email, 'student' FROM (VALUES ${values}) AS v(id, email);
     INSERT INTO public.course_enrolments (organization_id, user_id, course_id) SELECT '${w.orgA}', u, '${PPL_A}' FROM unnest('{${ids.join(',')}}'::uuid[]) u;`,
  )
  expect(r.err).toBe('')
  return ids
}
function dropBulkUsers(ids: string[]) {
  if (!ids.length) return
  const a = `'{${ids.join(',')}}'::uuid[]`
  psql(
    `DELETE FROM public.course_enrolments WHERE user_id = ANY(${a}); DELETE FROM public.users WHERE id = ANY(${a}); DELETE FROM auth.users WHERE id = ANY(${a});`,
  )
}
/** n extra subjects with an enabled org A exam config (psql). */
function bulkSubjects(w: World, n: number, tag: string): string[] {
  const r = psql(
    `WITH s AS (INSERT INTO public.easa_subjects (code, name, short, sort_order) SELECT '${tag}' || g || '${fixtureSuffix()}', 'Bulk ' || g, 'B' || g, 100 + g FROM generate_series(1, ${n}) g RETURNING id),
     c AS (INSERT INTO public.exam_configs (organization_id, subject_id, enabled, total_questions, time_limit_seconds, pass_mark) SELECT '${w.orgA}', id, true, 10, 1800, 75 FROM s RETURNING subject_id)
     SELECT subject_id FROM c;`,
  )
  expect(r.err).toBe('')
  return r.out.split('\n').filter(Boolean)
}
function dropBulkSubjects(ids: string[]) {
  if (!ids.length) return
  const a = `'{${ids.join(',')}}'::uuid[]`
  psql(
    `DELETE FROM public.exam_configs WHERE subject_id = ANY(${a}); DELETE FROM public.easa_subjects WHERE id = ANY(${a});`,
  )
}
/** Candidates for every id in psql. */
function bulkCandidates(w: World, sit: string, ids: string[]) {
  const r = psql(
    `INSERT INTO public.exam_sitting_candidates (organization_id, sitting_id, user_id) SELECT '${w.orgA}', '${sit}', u FROM unnest('{${ids.join(',')}}'::uuid[]) u;`,
  )
  expect(r.err).toBe('')
}
/** Entries for users x subjects in psql. */
function bulkEntries(w: World, sit: string, users: string[], subjects: string[]) {
  const r = psql(
    `INSERT INTO public.exam_sitting_entries (organization_id, sitting_id, user_id, subject_id) SELECT '${w.orgA}', '${sit}', u, s FROM unnest('{${users.join(',')}}'::uuid[]) u CROSS JOIN unnest('{${subjects.join(',')}}'::uuid[]) s;`,
  )
  expect(r.err).toBe('')
}
/** Unconsumed unvoided codes for every live entry of the sitting, expiring in 2 h. */
function bulkCodes(w: World, sit: string) {
  const r = psql(
    `INSERT INTO public.internal_exam_codes (code, subject_id, student_id, issued_by, organization_id, sitting_entry_id, expires_at) SELECT 'P' || substr(md5(e.id::text || random()::text), 1, 20), e.subject_id, e.user_id, '${w.a1}', '${w.orgA}', e.id, now() + interval '2 hours' FROM public.exam_sitting_entries e WHERE e.sitting_id = '${sit}' AND e.deleted_at IS NULL;`,
  )
  expect(r.err).toBe('')
}
function wipeSitting(w: World) {
  psql(
    `DELETE FROM public.internal_exam_codes WHERE organization_id = '${w.orgA}' AND sitting_entry_id IS NOT NULL; DELETE FROM public.exam_sitting_entries WHERE organization_id = '${w.orgA}'; DELETE FROM public.exam_sitting_candidates WHERE organization_id = '${w.orgA}';`,
  )
}
const call = (
  c: { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<Res> },
  fn: string,
  args: Record<string, unknown>,
) => c.rpc(fn, args)
/** An extra org A user with the given role, deactivated if asked. */
async function extraUser(w: World, tag: string, role: 'admin' | 'student', dead = false) {
  const email = `${tag}-${fixtureSuffix()}@test.local`
  const id = await createTestUser({ admin, orgId: w.orgA, email, password: PW, role })
  w.userIds.push(id)
  if (dead) await w.setUser(id, { deleted_at: now() })
  return { id, email }
}
/** A subject without any exam config. */
async function bareSubject(tag: string) {
  const r = await admin
    .from('easa_subjects')
    .insert({ code: `${tag}${fixtureSuffix()}`, name: 'bare', short: 'BR', sort_order: 9 })
    .select('id')
    .single()
  return must<{ id: string }>(r, 'bare subject').id
}
void [
  bulkUsers,
  dropBulkUsers,
  bulkSubjects,
  dropBulkSubjects,
  bulkCandidates,
  bulkEntries,
  bulkCodes,
  wipeSitting,
  call,
  extraUser,
  bareSubject,
]

type RosterEntry = Record<string, unknown> & {
  entry_id: string
  subject_id: string
  status: string
  attempt_number: number | null
  code: string | null
  code_id: string | null
  void_reason: string | null
  session_id: string | null
  code_expires_at: string | null
}
type RosterRow = {
  user_id: string
  full_name: string | null
  email: string
  deactivated: boolean
  has_attempt: boolean
  entries: RosterEntry[]
  total_count: number
}
const ENTRY_KEYS = [
  'entry_id',
  'subject_id',
  'subject_short',
  'subject_name',
  'course_id',
  'course_name',
  'status',
  'attempt_number',
  'passed',
  'score',
  'code_id',
  'code',
  'code_expires_at',
  'code_emailed_at',
  'void_reason',
  'session_id',
  'session_started_at',
]

/** AC-42..AC-48 and the p_show filter: list_exam_sitting_roster. */
describe('RPC: list_exam_sitting_roster', () => {
  let w: World
  let a2Client: Awaited<ReturnType<typeof getAuthenticatedClient>>
  const extra: Array<{ id: string; email: string }> = []
  beforeAll(async () => {
    w = await buildWorld('rost-sit')
    const a2 = await extraUser(w, 'rost-a2', 'admin')
    a2Client = await getAuthenticatedClient({ email: a2.email, password: PW })
    await w.setUser(a2.id, { deleted_at: now() })
    for (const t of ['r5', 'r6', 'r7', 'r8']) extra.push(await extraUser(w, t, 'student'))
  }, 120_000)
  afterEach(async () => {
    await restore(w)
  })
  afterAll(async () => {
    await w?.teardown()
  }, 120_000)

  const roster = (sit: string, o: Record<string, unknown> = {}, c = w.clients.a1) =>
    c.rpc('list_exam_sitting_roster', { p_sitting_id: sit, ...o })
  const rrows = (r: Res) => must<RosterRow[]>(r, 'roster')
  const person = (rs: RosterRow[], u: string) => rs.find((r) => r.user_id === u) as RosterRow
  const entryOf = (rs: RosterRow[], u: string, subject: string) =>
    person(rs, u)?.entries.find((e) => e.subject_id === subject) as RosterEntry
  const r5 = () => (extra[0] as { id: string }).id
  const r6 = () => (extra[1] as { id: string }).id
  const r7 = () => (extra[2] as { id: string }).id
  const r8 = () => (extra[3] as { id: string }).id

  it('AC-42: every status value appears; absent only on a closed sitting; people without entries are listed', async () => {
    const sched = await w.sitting({ day: 1 })
    await w.enter(sched, w.s1, w.subA)
    await w.code(await w.enter(sched, w.s1, w.subB))
    await w.code(await w.enter(sched, w.s2, w.subA), { expired: true })
    await w.code(await w.enter(sched, w.s2, w.subB), { voided: true })
    const open = await w.sitting({ day: 0, state: 'open' })
    await w.code(await w.enter(open, w.s3, w.subA))
    await w.code(await w.enter(open, w.s3, w.subB), {
      consumedBy: await w.session(w.s3, w.subB, { ended: false }),
    })
    await w.code(await w.enter(open, w.s4, w.subA), {
      consumedBy: await w.session(w.s4, w.subA, { ended: true, passed: false }),
    })
    await w.code(await w.enter(open, w.s4, w.subB), {
      voided: true,
      consumedBy: await w.session(w.s4, w.subB, { ended: true, passed: false }),
    })
    const closed = await w.sitting({ day: 0, state: 'closed' })
    await w.enter(closed, r5(), w.subA)
    await w.candidate(closed, r6())
    const gone = await w.entry(closed, r6(), w.subA)
    must(
      await admin
        .from('exam_sitting_entries')
        .update({ deleted_at: now() })
        .eq('id', gone)
        .select('id'),
      'remove entry',
    )
    await w.candidate(closed, r7())
    await deactivate(w, r7())
    const dead = await w.candidate(closed, r8())
    must(
      await admin
        .from('exam_sitting_candidates')
        .update({ deleted_at: now() })
        .eq('id', dead)
        .select('id'),
      'remove candidate',
    )
    const rs1 = rrows(await roster(sched))
    expect(entryOf(rs1, w.s1, w.subA).status).toBe('no_code')
    expect(entryOf(rs1, w.s1, w.subB).status).toBe('waiting')
    expect(entryOf(rs1, w.s2, w.subA).status).toBe('expired')
    expect(entryOf(rs1, w.s2, w.subB).status).toBe('voided')
    const rs2 = rrows(await roster(open))
    expect(entryOf(rs2, w.s3, w.subA).status).toBe('ready')
    expect(entryOf(rs2, w.s3, w.subB).status).toBe('running')
    expect(entryOf(rs2, w.s4, w.subA).status).toBe('finished')
    expect(entryOf(rs2, w.s4, w.subB).status).toBe('voided_attempt')
    const rs3 = rrows(await roster(closed))
    expect(entryOf(rs3, r5(), w.subA).status).toBe('absent')
    expect(person(rs3, r6()).entries).toEqual([])
    expect(person(rs3, r7()).deactivated).toBe(true)
    expect(rs3.find((r) => r.user_id === r8())).toBeUndefined()
    expect(rs1.flatMap((r) => r.entries).every((e) => e.status !== 'absent')).toBe(true)
  })

  it('a consumed code whose session was soft-deleted is discarded with no attempt number', async () => {
    const open = await w.sitting({ day: 0, state: 'open' })
    const sess = await w.session(w.s1, w.subA, { ended: false })
    await w.code(await w.enter(open, w.s1, w.subA), { consumedBy: sess })
    must(
      await admin.from('quiz_sessions').update({ deleted_at: now() }).eq('id', sess).select('id'),
      'discard session',
    )
    const e = entryOf(rrows(await roster(open)), w.s1, w.subA)
    expect(e.status).toBe('discarded')
    expect(e.attempt_number).toBeNull()
  })

  it('AC-43: attempt_number excludes voided attempts, a second attempt is N+1 and has_attempt follows consumed codes', async () => {
    const prior = await w.sitting({ day: 0, state: 'closed' })
    await w.code(await w.enter(prior, w.s4, w.subA), {
      consumedBy: await w.session(w.s4, w.subA, { ended: true, passed: false }),
    })
    const open = await w.sitting({ day: 0, state: 'open' })
    await w.code(await w.enter(open, w.s4, w.subA))
    await w.code(await w.enter(open, w.s3, w.subA), {
      consumedBy: await w.session(w.s3, w.subA, { ended: true, passed: false }),
    })
    await w.code(await w.enter(open, w.s3, w.subB), {
      voided: true,
      consumedBy: await w.session(w.s3, w.subB, { ended: true, passed: false }),
    })
    const rs = rrows(await roster(open))
    expect(entryOf(rs, w.s4, w.subA).attempt_number).toBe(2)
    expect(entryOf(rs, w.s3, w.subA).attempt_number).toBe(1)
    expect(entryOf(rs, w.s3, w.subB).attempt_number).toBeNull()
    expect(person(rs, w.s3).has_attempt).toBe(true)
    expect(person(rs, w.s4).has_attempt).toBe(false)
  })

  it('AC-44: entry jsonb has exactly the 17 keys; code only for unvoided codes that are consumed or unexpired', async () => {
    const open = await w.sitting({ day: 0, state: 'open' })
    const live = await w.code(await w.enter(open, w.s1, w.subA), { emailed: true })
    await w.code(await w.enter(open, w.s2, w.subA), { expired: true })
    const voided = await w.code(await w.enter(open, w.s2, w.subB), { voided: true })
    const sess = await w.session(w.s3, w.subA, { ended: true, passed: true })
    await w.code(await w.enter(open, w.s3, w.subA), { consumedBy: sess })
    const rs = rrows(await roster(open))
    const l = entryOf(rs, w.s1, w.subA)
    expect(Object.keys(l).sort()).toEqual([...ENTRY_KEYS].sort())
    expect(l.code).toBe((await w.codeRow(live)).code)
    expect(l.code_id).toBe(live)
    expect(l.code_expires_at).not.toBeNull()
    expect(l.code_emailed_at).not.toBeNull()
    expect(l.course_name).not.toBeNull()
    const exp = entryOf(rs, w.s2, w.subA)
    expect(exp.code).toBeNull()
    expect(exp.code_expires_at).not.toBeNull()
    const v = entryOf(rs, w.s2, w.subB)
    expect(v.code).toBeNull()
    expect(v.void_reason).toBe((await w.codeRow(voided)).void_reason)
    const c = entryOf(rs, w.s3, w.subA)
    expect(c.code).not.toBeNull()
    expect(c.session_id).toBe(sess)
    expect(c.session_started_at).not.toBeNull()
    expect(c.passed).toBe(true)
    expect(c).toHaveProperty('score')
  })

  it('AC-45: no audit row of the sitting carries a code key, code value, name or email', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.enter(sit, w.s1, w.subA)
    await w.enter(sit, w.s2, w.subA)
    must(await w.clients.a1.rpc('issue_sitting_exam_codes', { p_sitting_id: sit }), 'issue')
    const rs = rrows(await roster(sit))
    const codes = rs.flatMap((r) => r.entries.map((e) => e.code)).filter(Boolean) as string[]
    expect(codes).toHaveLength(2)
    const a = must<unknown[]>(
      await admin
        .from('audit_events')
        .select('event_type, metadata')
        .eq('organization_id', w.orgA)
        .or(`resource_id.eq.${sit},metadata->>sitting_id.eq.${sit}`),
      'audits',
    )
    const json = JSON.stringify(a)
    expect(a.length).toBeGreaterThan(0)
    expect(json).not.toMatch(/"code"\s*:/)
    for (const c of codes) expect(json).not.toContain(c)
    for (const r of rs) {
      expect(json).not.toContain(r.email)
      if (r.full_name) expect(json).not.toContain(r.full_name)
    }
  })

  it('AC-46: searches name and email case-insensitively and validates inputs', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.candidate(sit, w.s1)
    await w.candidate(sit, w.s2)
    const s1 = must<{ full_name: string; email: string }>(
      await admin.from('users').select('full_name, email').eq('id', w.s1).single(),
      's1',
    )
    const byName = rrows(await roster(sit, { p_q: s1.full_name.toUpperCase() }))
    expect(byName.map((r) => r.user_id)).toEqual([w.s1])
    const byMail = rrows(await roster(sit, { p_q: s1.email.slice(2, 12).toUpperCase() }))
    expect(byMail.map((r) => r.user_id)).toContain(w.s1)
    for (const bad of [
      { p_q: 'a'.repeat(101) },
      { p_limit: 0 },
      { p_limit: 101 },
      { p_offset: -1 },
    ]) {
      expectToken(await roster(sit, bad), 'invalid_input')
    }
  })

  it('AC-46: pages carry total_count and equal names are ordered by id across pages', async () => {
    const users = bulkUsers(w, 7, 'tie')
    try {
      psql(
        `UPDATE public.users SET full_name = 'Same Name' WHERE id = ANY('{${users.join(',')}}'::uuid[]);`,
      )
      const sit = await w.sitting({ day: 1 })
      bulkCandidates(w, sit, users)
      const all = rrows(await roster(sit, { p_limit: 100 }))
      const seen: string[] = []
      for (let off = 0; off < 7; off += 2) {
        const page = rrows(await roster(sit, { p_limit: 2, p_offset: off }))
        for (const r of page) expect(r.total_count).toBe(7)
        seen.push(...page.map((r) => r.user_id))
      }
      expect(seen).toEqual(all.map((r) => r.user_id))
      expect(seen).toEqual([...users].sort())
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
    }
  }, 120_000)

  it('AC-47: is readable on closed and cancelled sittings, guarded, STABLE and neither closes nor prunes', async () => {
    expect(
      psql(`SELECT provolatile FROM pg_proc WHERE proname = 'list_exam_sitting_roster';`).out,
    ).toBe('s')
    const closed = await w.sitting({ day: 0, state: 'closed' })
    const cancelled = await w.sitting({ day: 1, state: 'cancelled' })
    const foreign = await w.sitting({ day: 1, org: w.orgB })
    must(await roster(closed), 'closed')
    must(await roster(cancelled), 'cancelled')
    expectToken(await roster(foreign), 'sitting_not_found')
    expectToken(await roster(closed, {}, w.clients.s1), 'not_admin')
    expectToken(await roster(closed, {}, w.clients.i1), 'not_admin')
    expectToken(await roster(closed, {}, a2Client), 'not_admin')
    const stale = await w.sitting({ day: -2, state: 'open' })
    const e = await w.enter(stale, w.s1, w.subA)
    await scored(w, w.s1, w.subA, true)
    must(await roster(stale), 'stale')
    expect((await w.sittingRow(stale)).status).toBe('open')
    expect(
      must<{ deleted_at: string | null }>(
        await admin.from('exam_sitting_entries').select('deleted_at').eq('id', e).single(),
        'entry',
      ).deleted_at,
    ).toBeNull()
  })

  it('AC-48: a page of 100 over 500 candidates x 4 entries with codes finishes under 1 s', async () => {
    const users = bulkUsers(w, 500, 'r500')
    const more = bulkSubjects(w, 2, 'AR')
    try {
      const sit = await w.sitting({ day: 1 })
      bulkCandidates(w, sit, users)
      bulkEntries(w, sit, users, [w.subA, w.subB, ...more])
      bulkCodes(w, sit)
      psql('VACUUM ANALYZE;')
      const t = Date.now()
      const rs = rrows(await roster(sit, { p_limit: 100 }))
      expect(Date.now() - t).toBeLessThan(1000)
      expect(rs).toHaveLength(100)
      expect(rs[0]?.total_count).toBe(500)
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
      dropBulkSubjects(more)
    }
  }, 240_000)

  it('p_show: needs_code, not_emailed and has_attempts filter before paging; unknown values are invalid_input', async () => {
    const sit = await w.sitting({ day: 0, state: 'open' })
    await w.enter(sit, w.s1, w.subA)
    await w.code(await w.enter(sit, w.s2, w.subA))
    await w.code(await w.enter(sit, w.s3, w.subA), { emailed: true })
    await w.code(await w.enter(sit, w.s4, w.subA), {
      emailed: true,
      consumedBy: await w.session(w.s4, w.subA, { ended: true, passed: false }),
    })
    // unemailed but expired (s3) or consumed (s4): not left to email
    await w.code(await w.enter(sit, w.s3, w.subB), { expired: true })
    await w.code(await w.enter(sit, w.s4, w.subB), {
      consumedBy: await w.session(w.s4, w.subB, { ended: true, passed: false }),
    })
    const ids = async (show: string, o: Record<string, unknown> = {}) =>
      rrows(await roster(sit, { p_show: show, ...o })).map((r) => r.user_id)
    expect(await ids('all')).toHaveLength(4)
    expect(await ids('needs_code')).toEqual([w.s1])
    expect(await ids('not_emailed')).toEqual([w.s2])
    expect(await ids('has_attempts')).toEqual([w.s4])
    const filtered = rrows(await roster(sit, { p_show: 'has_attempts', p_limit: 1 }))
    expect(filtered[0]?.total_count).toBe(1)
    expectToken(await roster(sit, { p_show: 'everything' }), 'invalid_input')
  })
})
