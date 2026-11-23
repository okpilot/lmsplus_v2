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

/** Never-ended session with a time limit, started `agoSec` seconds ago. */
async function timedSession(
  w: World,
  student: string,
  subject: string,
  agoSec: number,
  limit: number,
) {
  const id = await w.session(student, subject, { ended: false })
  must(
    await admin
      .from('quiz_sessions')
      .update({
        started_at: new Date(Date.now() - agoSec * 1000).toISOString(),
        time_limit_seconds: limit,
      })
      .eq('id', id)
      .select('id'),
    'timed session',
  )
  return id
}

type Elig = {
  subject_id: string
  subject_name: string
  subject_short: string
  course_id: string | null
  course_name: string | null
  people: number
  eligible: number
  entered_here: number
  passed: number
  attempt_running: number
  entered_elsewhere: number
  not_enrolled: number
  deactivated: number
  state: string | null
  attempt_count: number | null
  passed_at: string | null
  passed_score: number | null
  elsewhere_sitting_id: string | null
  elsewhere_at: string | null
}
const STATES = [
  'eligible',
  'entered_here',
  'passed',
  'attempt_running',
  'entered_elsewhere',
  'not_enrolled',
  'deactivated',
] as const

/** AC-36..AC-41: get_exam_sitting_subject_eligibility. */
describe('RPC: get_exam_sitting_subject_eligibility', () => {
  let w: World
  let a2Client: Awaited<ReturnType<typeof getAuthenticatedClient>>
  beforeAll(async () => {
    w = await buildWorld('elig-sit')
    const a2 = await extraUser(w, 'elig-a2', 'admin')
    a2Client = await getAuthenticatedClient({ email: a2.email, password: PW })
    await w.setUser(a2.id, { deleted_at: now() })
  }, 120_000)
  afterEach(async () => {
    await restore(w)
  })
  afterAll(async () => {
    await w?.teardown()
  }, 120_000)

  const elig = (sit: string, users?: unknown, c = w.clients.a1) => {
    const args: Record<string, unknown> = { p_sitting_id: sit }
    if (users !== undefined) args.p_user_ids = users
    return c.rpc('get_exam_sitting_subject_eligibility', args)
  }
  const erows = (r: Res) => must<Elig[]>(r, 'eligibility')
  const forSubject = (rs: Elig[], s: string) => rs.find((r) => r.subject_id === s) as Elig

  it('AC-36: a single user gets one state per subject with the detail columns', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    const o1 = await w.sitting({ day: 0, state: 'open' })
    const o2 = await w.sitting({ day: 0, state: 'open' })
    for (const u of [w.s1, w.s2, w.s3, w.s4]) await w.candidate(x, u)
    await w.entry(x, w.s1, w.subA)
    for (const o of [o1, o2]) {
      const e = await w.enter(o, w.s1, w.subB)
      await w.code(e, { consumedBy: await w.session(w.s1, w.subB, { ended: true, passed: false }) })
    }
    await scored(w, w.s2, w.subA, true)
    await w.session(w.s2, w.subB, { ended: false })
    await w.enter(y, w.s4, w.subA)
    await unenrol(w.s4)
    await deactivate(w, w.s3)
    const s1 = erows(await elig(x, [w.s1]))
    expect(forSubject(s1, w.subA)).toMatchObject({
      state: 'entered_here',
      people: 1,
      entered_here: 1,
    })
    expect(forSubject(s1, w.subB)).toMatchObject({
      state: 'eligible',
      attempt_count: 2,
      eligible: 1,
    })
    const s2 = erows(await elig(x, [w.s2]))
    const passed = forSubject(s2, w.subA)
    expect(passed.state).toBe('passed')
    expect(passed.passed_at).not.toBeNull()
    expect(Number(passed.passed_score)).toBeCloseTo(90)
    expect(forSubject(s2, w.subB).state).toBe('attempt_running')
    const s4 = erows(await elig(x, [w.s4]))
    const els = forSubject(s4, w.subA)
    expect(els.state).toBe('entered_elsewhere')
    expect(els.elsewhere_sitting_id).toBe(y)
    expect(new Date(els.elsewhere_at as string).getTime()).toBe(
      new Date((await w.sittingRow(y)).scheduled_at as string).getTime(),
    )
    expect(forSubject(s4, w.subB).state).toBe('not_enrolled')
    const s3 = erows(await elig(x, [w.s3]))
    expect(forSubject(s3, w.subA).state).toBe('deactivated')
    expect(forSubject(s3, w.subA).deactivated).toBe(1)
  })

  it('AC-P1: a never-ended session past its time limit + 30s is not attempt_running', async () => {
    const x = await w.sitting({ day: 1 })
    await w.candidate(x, w.s1)
    await timedSession(w, w.s1, w.subA, 1900, 1800)
    const r = forSubject(erows(await elig(x, [w.s1])), w.subA)
    expect(r.state).not.toBe('attempt_running')
    expect(r.attempt_running).toBe(0)
  })

  it('AC-P2: a never-ended session inside its time limit stays attempt_running', async () => {
    const x = await w.sitting({ day: 1 })
    await w.candidate(x, w.s1)
    await timedSession(w, w.s1, w.subA, 600, 1800)
    const r = forSubject(erows(await elig(x, [w.s1])), w.subA)
    expect(r.state).toBe('attempt_running')
    expect(r.attempt_running).toBe(1)
  })

  it('AC-37: two users null the detail columns, counts sum to people and eligible equals what add would add', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    for (const u of [w.s1, w.s2, w.s4]) await w.candidate(x, u)
    await w.entry(x, w.s1, w.subA)
    await scored(w, w.s2, w.subA, true)
    await w.enter(y, w.s4, w.subB)
    const people = [w.s1, w.s2, w.s4]
    const rs = erows(await elig(x, people))
    let eligibleTotal = 0
    for (const r of rs) {
      expect(r.people).toBe(3)
      expect(STATES.reduce((n, k) => n + Number(r[k]), 0)).toBe(3)
      for (const k of [
        'state',
        'attempt_count',
        'passed_at',
        'passed_score',
        'elsewhere_sitting_id',
        'elsewhere_at',
      ] as const) {
        expect(r[k], `${r.subject_id} ${k}`).toBeNull()
      }
      eligibleTotal += r.eligible
    }
    const subjects = rs.map((r) => r.subject_id)
    const added = rowOf(
      must(
        await w.clients.a1.rpc('add_exam_sitting_entries', {
          p_sitting_id: x,
          p_user_ids: people.flatMap((u) => subjects.map(() => u)),
          p_subject_ids: people.flatMap(() => subjects),
        }),
        'add',
      ),
    ).added
    expect(added).toBe(eligibleTotal)
  })

  it('AC-38: only subjects with a live enabled config appear, in course, sort order, short, id order, capped at 200', async () => {
    const x = await w.sitting({ day: 1 })
    await w.candidate(x, w.s1)
    const extra = bulkSubjects(w, 205, 'AL')
    try {
      const rs = erows(await elig(x, [w.s1]))
      expect(rs).toHaveLength(200)
      expect(forSubject(rs, w.subA).course_id).not.toBeNull()
      expect(forSubject(rs, w.subA).course_name).not.toBeNull()
      psql(
        `UPDATE public.exam_configs SET enabled = false WHERE subject_id = '${extra[0]}' AND organization_id = '${w.orgA}'; UPDATE public.exam_configs SET deleted_at = now() WHERE subject_id = '${extra[1]}' AND organization_id = '${w.orgA}'; UPDATE public.easa_subjects SET deleted_at = now() WHERE id = '${extra[2]}';`,
      )
      const after = erows(await elig(x, [w.s1]))
      const ids = after.map((r) => r.subject_id)
      for (const gone of extra.slice(0, 3)) expect(ids).not.toContain(gone)
      expect(ids).toContain(w.subA)
      const meta = must<Array<{ id: string; sort_order: number; short: string }>>(
        await admin.from('easa_subjects').select('id, sort_order, short').in('id', ids),
        'meta',
      )
      const cmp = (a: Elig, b: Elig) => {
        const ma = meta.find((m) => m.id === a.subject_id)
        const mb = meta.find((m) => m.id === b.subject_id)
        if (a.course_name !== b.course_name) {
          if (a.course_name === null) return 1
          if (b.course_name === null) return -1
          return a.course_name < b.course_name ? -1 : 1
        }
        if ((ma?.sort_order ?? 0) !== (mb?.sort_order ?? 0))
          return (ma?.sort_order ?? 0) - (mb?.sort_order ?? 0)
        return 0
      }
      for (let i = 1; i < after.length; i++) {
        expect(cmp(after[i - 1] as Elig, after[i] as Elig)).toBeLessThanOrEqual(0)
      }
    } finally {
      dropBulkSubjects(extra)
    }
  }, 180_000)

  it('AC-39: NULL means all live candidates; explicit lists are validated, deduped and filtered', async () => {
    const x = await w.sitting({ day: 1 })
    await w.candidate(x, w.s1)
    await w.candidate(x, w.s2)
    expect(forSubject(erows(await elig(x, null)), w.subA).people).toBe(2)
    expect(forSubject(erows(await elig(x)), w.subA).people).toBe(2)
    expect(forSubject(erows(await elig(x, [w.s1, w.s1])), w.subA).people).toBe(1)
    expect(forSubject(erows(await elig(x, [w.s1, w.s4, w.bs1])), w.subA).people).toBe(1)
    for (const bad of [
      [null],
      [],
      Array.from({ length: 101 }, () => crypto.randomUUID()),
      [w.s4, w.bs1],
    ]) {
      expectToken(await elig(x, bad), 'invalid_input')
    }
    const empty = await w.sitting({ day: 2 })
    expect(erows(await elig(empty, null))).toHaveLength(0)
  })

  it('AC-39: NULL with 501 candidates is invalid_input', async () => {
    const users = bulkUsers(w, 501, 'e501')
    try {
      const x = await w.sitting({ day: 1 })
      bulkCandidates(w, x, users)
      expectToken(await elig(x, null), 'invalid_input')
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
    }
  }, 120_000)

  it('AC-40: lifecycle tokens, caller checks and STABLE', async () => {
    expect(
      psql(
        `SELECT provolatile FROM pg_proc WHERE proname = 'get_exam_sitting_subject_eligibility';`,
      ).out,
    ).toBe('s')
    const closed = await w.sitting({ day: 0, state: 'closed' })
    const ended = await w.sitting({ day: -2 })
    const cancelled = await w.sitting({ day: 1, state: 'cancelled' })
    const foreign = await w.sitting({ day: 1, org: w.orgB })
    const ok = await w.sitting({ day: 1 })
    await w.candidate(ok, w.s1)
    expectToken(await elig(closed), 'sitting_closed')
    expectToken(await elig(ended), 'sitting_day_ended')
    expectToken(await elig(cancelled), 'sitting_not_found')
    expectToken(await elig(foreign), 'sitting_not_found')
    expectToken(await elig(ok, undefined, w.clients.s1), 'not_admin')
    expectToken(await elig(ok, undefined, w.clients.i1), 'not_admin')
    expectToken(await elig(ok, undefined, a2Client), 'not_admin')
    await deactivate(w, w.s1)
    expect(forSubject(erows(await elig(ok)), w.subA).deactivated).toBe(1)
  })

  it('AC-41: 100 users x 60 subjects under 1 s; 500 users x 60 subjects under 1.5 s', async () => {
    const users = bulkUsers(w, 500, 'e500')
    const extra = bulkSubjects(w, 58, 'AM')
    try {
      const x = await w.sitting({ day: 1 })
      bulkCandidates(w, x, users)
      psql('VACUUM ANALYZE;')
      const t1 = Date.now()
      const r1 = erows(await elig(x, users.slice(0, 100)))
      expect(Date.now() - t1).toBeLessThan(1000)
      expect(r1.length).toBeGreaterThanOrEqual(60)
      const t2 = Date.now()
      erows(await elig(x, null))
      expect(Date.now() - t2).toBeLessThan(1500)
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
      dropBulkSubjects(extra)
    }
  }, 240_000)
})
