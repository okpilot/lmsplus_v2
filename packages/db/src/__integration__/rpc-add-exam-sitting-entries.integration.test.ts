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

const COUNT_KEYS = [
  'added',
  'skipped_existing',
  'skipped_not_candidate',
  'skipped_deactivated',
  'skipped_not_enrolled',
  'skipped_passed',
  'skipped_entered_elsewhere',
  'skipped_attempt_running',
]
type Skip = { user_id: string; subject_id: string; reason: string; detail_at?: string }

/** AC-6..AC-16, AC-62: add_exam_sitting_entries. */
describe('RPC: add_exam_sitting_entries', () => {
  let w: World
  let subs: string[] = []
  let a2: { id: string; email: string }
  let a2Client: Awaited<ReturnType<typeof getAuthenticatedClient>>
  beforeAll(async () => {
    w = await buildWorld('add-sit')
    subs = bulkSubjects(w, 40, 'AD')
    a2 = await extraUser(w, 'add-a2', 'admin', false)
    a2Client = await getAuthenticatedClient({ email: a2.email, password: PW })
    await w.setUser(a2.id, { deleted_at: now() })
  }, 120_000)
  afterEach(async () => {
    await restore(w)
  })
  afterAll(async () => {
    dropBulkSubjects(subs)
    await w?.teardown()
  }, 120_000)

  const add = (sit: string, users: string[], subjects: string[], c = w.clients.a1) =>
    c.rpc('add_exam_sitting_entries', {
      p_sitting_id: sit,
      p_user_ids: users,
      p_subject_ids: subjects,
    })
  const out = (r: Res) => rowOf(must(r, 'add'))
  const skipsOf = (o: Record<string, unknown>) => o.skipped as Skip[]
  const reasonOf = (o: Record<string, unknown>, u: string, s: string) =>
    skipsOf(o).find((k) => k.user_id === u && k.subject_id === s)

  it('AC-6: adds each pair, returns an empty skipped list and audits only the 8 count keys', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.candidate(sit, w.s1)
    await w.candidate(sit, w.s2)
    const o = out(await add(sit, [w.s1, w.s2, w.s1], [w.subA, w.subA, w.subB]))
    expect(o.added).toBe(3)
    expect(o.skipped).toEqual([])
    expect(await countOf('exam_sitting_entries', w.orgA, sit)).toBe(3)
    const a = await w.audits('exam_sitting.entries_added', sit)
    expect(a).toHaveLength(1)
    expect(Object.keys(a[0]?.metadata ?? {}).sort()).toEqual([...COUNT_KEYS].sort())
    expect(JSON.stringify(a[0]?.metadata)).not.toContain(w.s1)
  })

  it('AC-7, AC-8: every skip reason has its count and skipped element; not_candidate beats every state', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    const s5 = await extraUser(w, 'add-s5', 'student')
    const s6 = await extraUser(w, 'add-s6', 'student')
    const s7 = await extraUser(w, 'add-s7', 'student')
    for (const u of [w.s1, w.s2, w.s3, w.s4, s5.id]) await w.candidate(x, u)
    const removed = await w.candidate(x, s6.id)
    must(
      await admin
        .from('exam_sitting_candidates')
        .update({ deleted_at: now() })
        .eq('id', removed)
        .select('id'),
      'remove candidate',
    )
    await w.entry(x, w.s1, w.subA)
    await w.session(w.s1, w.subB, { ended: false })
    await scored(w, w.s2, w.subA, true)
    await w.enter(y, w.s2, w.subB)
    await w.enter(y, w.s2, w.subA)
    await deactivate(w, w.s3)
    await unenrol(w.s4)
    await scored(w, s7.id, w.subA, true)
    const pairs: Array<[string, string]> = [
      [w.s1, w.subA],
      [w.s1, w.subB],
      [w.s2, w.subA],
      [w.s2, w.subB],
      [w.s3, w.subA],
      [w.s4, w.subA],
      [s5.id, w.subA],
      [s6.id, w.subA],
      [s7.id, w.subA],
      [w.bs1, w.subA],
    ]
    const o = out(
      await add(
        x,
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1]),
      ),
    )
    expect(o).toMatchObject({
      added: 1,
      skipped_existing: 1,
      skipped_attempt_running: 1,
      skipped_passed: 1,
      skipped_entered_elsewhere: 1,
      skipped_deactivated: 1,
      skipped_not_enrolled: 1,
      skipped_not_candidate: 3,
    })
    const total = COUNT_KEYS.reduce((n, k) => n + Number(o[k]), 0)
    expect(total).toBe(pairs.length)
    expect(reasonOf(o, w.s1, w.subA)?.reason).toBe('existing')
    expect(reasonOf(o, w.s1, w.subB)?.reason).toBe('attempt_running')
    expect(reasonOf(o, w.s2, w.subA)?.reason).toBe('passed')
    expect(reasonOf(o, w.s2, w.subB)?.reason).toBe('entered_elsewhere')
    expect(reasonOf(o, w.s3, w.subA)?.reason).toBe('deactivated')
    expect(reasonOf(o, w.s4, w.subA)?.reason).toBe('not_enrolled')
    expect(reasonOf(o, s6.id, w.subA)?.reason).toBe('not_candidate')
    expect(reasonOf(o, s7.id, w.subA)?.reason).toBe('not_candidate')
    expect(reasonOf(o, w.bs1, w.subA)?.reason).toBe('not_candidate')
    expect(reasonOf(o, s5.id, w.subA)).toBeUndefined()
    expect(o.skipped as unknown[]).toHaveLength(9)
  })

  it('AC-8: passed and entered_elsewhere together count as skipped_passed', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    await w.candidate(x, w.s1)
    await scored(w, w.s1, w.subA, true)
    await w.enter(y, w.s1, w.subA)
    const o = out(await add(x, [w.s1], [w.subA]))
    expect(o.skipped_passed).toBe(1)
    expect(o.skipped_entered_elsewhere).toBe(0)
  })

  it('AC-9: detail_at is the pass time or the other sitting time and absent otherwise', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2, hour: 11 })
    for (const u of [w.s1, w.s2, w.s4]) await w.candidate(x, u)
    const sess = await scored(w, w.s1, w.subA, true)
    const ended = must<{ ended_at: string }>(
      await admin.from('quiz_sessions').select('ended_at').eq('id', sess).single(),
      'session',
    ).ended_at
    await w.enter(y, w.s2, w.subA)
    await w.entry(x, w.s4, w.subA)
    const o = out(await add(x, [w.s1, w.s2, w.s4], [w.subA, w.subA, w.subA]))
    const passed = reasonOf(o, w.s1, w.subA)
    const elsewhere = reasonOf(o, w.s2, w.subA)
    const existing = reasonOf(o, w.s4, w.subA)
    expect(new Date(passed?.detail_at as string).getTime()).toBe(new Date(ended).getTime())
    expect(new Date(elsewhere?.detail_at as string).getTime()).toBe(
      new Date((await w.sittingRow(y)).scheduled_at as string).getTime(),
    )
    expect(existing).toBeDefined()
    expect(existing).not.toHaveProperty('detail_at')
  })

  it('AC-10: 60 skipped pairs return 50 elements ordered reason, user_id, subject_id with exact counts', async () => {
    const x = await w.sitting({ day: 1 })
    const s5 = await extraUser(w, 'add-s5', 'student')
    const s7 = await extraUser(w, 'add-s7', 'student')
    const us = [s5.id, s7.id]
    const ss = subs.slice(0, 30)
    const o = out(
      await add(
        x,
        us.flatMap((u) => ss.map(() => u)),
        us.flatMap(() => ss),
      ),
    )
    expect(o.skipped_not_candidate).toBe(60)
    const sk = skipsOf(o)
    expect(sk).toHaveLength(50)
    const key = (k: Skip) => `${k.reason}|${k.user_id}|${k.subject_id}`
    expect(sk.map(key)).toEqual([...sk.map(key)].sort())
  })

  it('AC-11: an elsewhere entry with a finished attempt and a same-day sitting without an entry do not block', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    await w.sitting({ day: 1, hour: 15 })
    await w.candidate(x, w.s1)
    await w.candidate(x, w.s2)
    const e = await w.enter(y, w.s1, w.subA)
    await w.code(e, { consumedBy: await w.session(w.s1, w.subA, { ended: true, passed: false }) })
    const o = out(await add(x, [w.s1, w.s2], [w.subA, w.subA]))
    expect(o.added).toBe(2)
  })

  it('AC-12: invalid_input for NULL arrays, NULL elements, unequal lengths, empty and 1001 distinct pairs', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.candidate(sit, w.s1)
    const bad: Array<[unknown, unknown]> = [
      [null, [w.subA]],
      [[w.s1], null],
      [
        [w.s1, null],
        [w.subA, w.subA],
      ],
      [
        [w.s1, w.s2],
        [w.subA, null],
      ],
      [[w.s1, w.s2], [w.subA]],
      [[], []],
      [
        Array.from({ length: 1001 }, () => crypto.randomUUID()),
        Array.from({ length: 1001 }, () => w.subA),
      ],
    ]
    for (const [u, s] of bad) {
      const r = await w.clients.a1.rpc('add_exam_sitting_entries', {
        p_sitting_id: sit,
        p_user_ids: u,
        p_subject_ids: s,
      })
      expectToken(r, 'invalid_input')
    }
    expect(await countOf('exam_sitting_entries', w.orgA, sit)).toBe(0)
  })

  it('AC-12: duplicate pairs are counted once and exactly 1000 distinct pairs are accepted', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.candidate(sit, w.s1)
    expect(out(await add(sit, [w.s1, w.s1], [w.subA, w.subA])).added).toBe(1)
    const many = Array.from({ length: 1000 }, () => crypto.randomUUID())
    const o = out(
      await add(
        sit,
        many,
        many.map(() => w.subA),
      ),
    )
    expect(o.skipped_not_candidate).toBe(1000)
  })

  it('AC-13: lifecycle tokens, ordering and rollback', async () => {
    const closed = await w.sitting({ day: 0, state: 'closed' })
    const ended = await w.sitting({ day: -2 })
    const cancelled = await w.sitting({ day: 1, state: 'cancelled' })
    const foreign = await w.sitting({ day: 1, org: w.orgB })
    const open = await w.sitting({ day: 0, state: 'open' })
    await w.candidate(open, w.s1)
    expectToken(await add(closed, [w.s1], [w.subA]), 'sitting_closed')
    expectToken(await add(ended, [w.s1], [w.subA]), 'sitting_day_ended')
    expectToken(await add(cancelled, [w.s1], [w.subA]), 'sitting_not_found')
    expectToken(await add(foreign, [w.s1], [w.subA]), 'sitting_not_found')
    expectToken(await add(closed, [], []), 'invalid_input')
    expect(out(await add(open, [w.s1], [w.subA])).added).toBe(1)
    for (const s of [closed, ended, cancelled, foreign]) {
      expect(await auditCount(w.orgA, 'exam_sitting.entries_added', s)).toBe(0)
      expect(await countOf('exam_sitting_entries', w.orgA, s)).toBe(0)
    }
  })

  it('AC-13: subject_not_found and exam_config_required leave nothing behind', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.candidate(sit, w.s1)
    const bare = await bareSubject('NOCFG')
    const dead = must<{ id: string }>(
      await admin
        .from('easa_subjects')
        .insert({
          code: `DD${fixtureSuffix()}`,
          name: 'dead',
          short: 'DD',
          sort_order: 9,
          deleted_at: now(),
        })
        .select('id')
        .single(),
      'dead subject',
    ).id
    try {
      expectToken(await add(sit, [w.s1, w.s1], [w.subA, crypto.randomUUID()]), 'subject_not_found')
      expectToken(await add(sit, [w.s1, w.s1], [w.subA, dead]), 'subject_not_found')
      expectToken(await add(sit, [w.s1, w.s1], [w.subA, bare]), 'exam_config_required')
      expect(await countOf('exam_sitting_entries', w.orgA, sit)).toBe(0)
      expect(await auditCount(w.orgA, 'exam_sitting.entries_added', sit)).toBe(0)
    } finally {
      await admin.from('easa_subjects').delete().in('id', [bare, dead])
    }
  })

  it('AC-13: callers other than an active admin are refused', async () => {
    const sit = await w.sitting({ day: 1 })
    expectToken(await add(sit, [w.s1], [w.subA], w.clients.s1), 'not_admin')
    expectToken(await add(sit, [w.s1], [w.subA], w.clients.i1), 'not_admin')
    expectToken(await add(sit, [w.s1], [w.subA], a2Client), 'not_admin')
    expectToken(
      await add(sit, [w.s1], [w.subA], admin as unknown as typeof w.clients.a1),
      'not_authenticated',
    )
    const anon = await add(sit, [w.s1], [w.subA], w.clients.anon)
    expect(anon.error?.code).toBe('42501')
  })

  it('AC-14: the 2000 live entry cap blocks one more eligible pair; exactly 2000 is fine; skips do not count', async () => {
    const users = bulkUsers(w, 50, 'cap')
    try {
      const sit = await w.sitting({ day: 1 })
      bulkCandidates(w, sit, [...users, w.s1])
      bulkEntries(w, sit, users, subs) // 50 x 40 = 2000
      expect(await countOf('exam_sitting_entries', w.orgA, sit)).toBe(2000)
      expectToken(await add(sit, [w.s1], [w.subA]), 'too_many_entries')
      expect(await countOf('exam_sitting_entries', w.orgA, sit)).toBe(2000)
      const skipOnly = out(await add(sit, [users[0] as string], [subs[0] as string]))
      expect(skipOnly.skipped_existing).toBe(1)
      psql(`UPDATE public.exam_sitting_entries SET deleted_at = now() WHERE sitting_id = '${sit}';`)
      const sit2 = await w.sitting({ day: 2 })
      bulkCandidates(w, sit2, users)
      bulkEntries(w, sit2, users.slice(0, 49), subs)
      bulkEntries(w, sit2, [users[49] as string], subs.slice(0, 39))
      expect(await countOf('exam_sitting_entries', w.orgA, sit2)).toBe(1999)
      expect(out(await add(sit2, [users[49] as string], [subs[39] as string])).added).toBe(1)
      expect(await countOf('exam_sitting_entries', w.orgA, sit2)).toBe(2000)
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
    }
  }, 180_000)

  it('AC-15: re-adding a pair after its entry was soft-deleted creates a new row; the audit row is written when added = 0', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.candidate(sit, w.s1)
    const old = await w.entry(sit, w.s1, w.subA)
    must(
      await admin
        .from('exam_sitting_entries')
        .update({ deleted_at: now() })
        .eq('id', old)
        .select('id'),
      'soft delete entry',
    )
    const o = out(await add(sit, [w.s1], [w.subA]))
    expect(o.added).toBe(1)
    const all = must<Array<{ id: string; deleted_at: string | null }>>(
      await admin.from('exam_sitting_entries').select('id, deleted_at').eq('sitting_id', sit),
      'entries',
    )
    expect(all).toHaveLength(2)
    expect(all.find((e) => e.id === old)?.deleted_at).not.toBeNull()
    expect(out(await add(sit, [w.s1], [w.subA])).added).toBe(0)
    expect(await auditCount(w.orgA, 'exam_sitting.entries_added', sit)).toBe(2)
    const live = must<Array<{ user_id: string }>>(
      await admin
        .from('exam_sitting_entries')
        .select('user_id')
        .eq('sitting_id', sit)
        .is('deleted_at', null),
      'live',
    )
    const cands = must<Array<{ user_id: string }>>(
      await admin
        .from('exam_sitting_candidates')
        .select('user_id')
        .eq('sitting_id', sit)
        .is('deleted_at', null),
      'cands',
    )
    for (const e of live) expect(cands.map((c) => c.user_id)).toContain(e.user_id)
  })

  it('AC-16: 1000 pairs over 500 candidates x 60 subjects classify not_candidate first and finish under 1.5 s', async () => {
    const users = bulkUsers(w, 500, 'perf')
    const more = bulkSubjects(w, 20, 'AE')
    try {
      const sit = await w.sitting({ day: 1 })
      bulkCandidates(w, sit, users)
      const sixty = [...subs, ...more]
      const us = users.slice(0, 500)
      const pu: string[] = []
      const ps: string[] = []
      for (let i = 0; i < 1000; i++) {
        pu.push(us[i % 500] as string)
        ps.push(sixty[Math.floor(i / 500) * 30 + (i % 30)] as string)
      }
      psql('VACUUM ANALYZE;')
      const t = Date.now()
      must(await add(sit, pu, ps), 'big add')
      expect(Date.now() - t).toBeLessThan(1500)
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
      dropBulkSubjects(more)
    }
  }, 240_000)

  it('AC-62: the audit row carries actor_id = caller and the cached actor_role', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.candidate(sit, w.s1)
    must(await add(sit, [w.s1], [w.subA]), 'add')
    const a = await w.audits('exam_sitting.entries_added', sit)
    expect(a[0]).toMatchObject({ actor_id: w.a1, actor_role: 'admin' })
  })
})
