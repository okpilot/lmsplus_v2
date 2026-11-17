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

const ISSUE_KEYS = [
  'issued',
  'reissued_after_expiry',
  'skipped_already_issued',
  'skipped_attempt_taken',
  'skipped_no_config',
  'skipped_deactivated',
  'skipped_not_enrolled',
  'skipped_passed',
]

/** AC-20..AC-30, AC-62: issue_sitting_exam_codes. */
describe('RPC: issue_sitting_exam_codes', () => {
  let w: World
  let a2Client: Awaited<ReturnType<typeof getAuthenticatedClient>>
  beforeAll(async () => {
    w = await buildWorld('iss-sit')
    const a2 = await extraUser(w, 'iss-a2', 'admin')
    a2Client = await getAuthenticatedClient({ email: a2.email, password: PW })
    await w.setUser(a2.id, { deleted_at: now() })
  }, 120_000)
  afterEach(async () => {
    await restore(w)
    must(
      await admin
        .from('exam_configs')
        .update({ enabled: true })
        .eq('organization_id', w.orgA)
        .select('id'),
      'enable configs',
    )
  })
  afterAll(async () => {
    await w?.teardown()
  }, 120_000)

  const issue = (sit: string, o: { users?: unknown; entries?: unknown } = {}, c = w.clients.a1) => {
    const args: Record<string, unknown> = { p_sitting_id: sit }
    if ('users' in o) args.p_user_ids = o.users
    if ('entries' in o) args.p_entry_ids = o.entries
    return c.rpc('issue_sitting_exam_codes', args)
  }
  const out = (r: Res) => rowOf(must(r, 'issue'))
  const codesOf = async (entry: string) =>
    must<Array<Record<string, unknown>>>(
      await admin.from('internal_exam_codes').select('*').eq('sitting_entry_id', entry),
      'codes',
    )
  const liveCodes = async (entry: string) =>
    (await codesOf(entry)).filter((c) => c.voided_at === null)
  const sittingAudits = async (type: string, sit: string) =>
    must<Array<{ metadata: Record<string, unknown> }>>(
      await admin
        .from('audit_events')
        .select('metadata')
        .eq('organization_id', w.orgA)
        .eq('event_type', type)
        .eq('metadata->>sitting_id', sit),
      'sitting audits',
    )
  const expiryOf = (scheduled: string) =>
    psql(`SELECT private.sitting_code_expiry('${scheduled}'::timestamptz);`).out

  it('AC-20: issues one code per entry with entry, issuer, expiry and a code_issued audit row without the code', async () => {
    for (const state of ['scheduled', 'open'] as const) {
      const sit = await w.sitting({ day: state === 'open' ? 0 : 1, state })
      const e1 = await w.enter(sit, w.s1, w.subA)
      const e2 = await w.enter(sit, w.s2, w.subA)
      const e3 = await w.enter(sit, w.s1, w.subB)
      const r = out(await issue(sit))
      expect(r.issued).toBe(3)
      const scheduled = (await w.sittingRow(sit)).scheduled_at as string
      const exp = new Date(expiryOf(scheduled)).getTime()
      for (const e of [e1, e2, e3]) {
        const codes = await liveCodes(e)
        expect(codes).toHaveLength(1)
        expect(codes[0]).toMatchObject({ sitting_entry_id: e, issued_by: w.a1, emailed_at: null })
        expect(new Date(codes[0]?.expires_at as string).getTime()).toBe(exp)
      }
      const issued = await sittingAudits('internal_exam.code_issued', sit)
      expect(issued).toHaveLength(3)
      for (const a of issued) {
        expect(Object.keys(a.metadata).sort()).toEqual(
          ['entry_id', 'expires_at', 'sitting_id', 'student_id', 'subject_id'].sort(),
        )
      }
      for (const e of [e1, e2, e3]) {
        const code = (await liveCodes(e))[0]?.code as string
        expect(JSON.stringify(r)).not.toContain(code)
        expect(JSON.stringify(await sittingAudits('internal_exam.code_issued', sit))).not.toContain(
          code,
        )
      }
    }
  })

  it('AC-21: user and entry subsets issue only the selection; both is the intersection; NULL is all', async () => {
    const sit = await w.sitting({ day: 1 })
    const e1 = await w.enter(sit, w.s1, w.subA)
    const e2 = await w.enter(sit, w.s2, w.subA)
    const e3 = await w.enter(sit, w.s1, w.subB)
    expect(out(await issue(sit, { users: [w.s1] })).issued).toBe(2)
    expect(await liveCodes(e2)).toHaveLength(0)
    expect(out(await issue(sit, { entries: [e2] })).issued).toBe(1)
    const sit2 = await w.sitting({ day: 2 })
    const f1 = await w.enter(sit2, w.s3, w.subA)
    await w.enter(sit2, w.s4, w.subA)
    await w.setUser(w.s3, { deleted_at: null })
    expect(out(await issue(sit2, { users: [w.s3, w.s4], entries: [f1] })).issued).toBe(1)
    expect(out(await issue(sit2, { users: null, entries: null })).issued).toBe(1)
    expect(await liveCodes(e1)).toHaveLength(1)
    expect(await liveCodes(e3)).toHaveLength(1)
  })

  it('AC-22: invalid_input for NULL elements, empty arrays, 501 ids and no remaining candidate', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.enter(sit, w.s1, w.subA)
    const many = Array.from({ length: 501 }, () => crypto.randomUUID())
    for (const o of [
      { users: [null] },
      { users: [] },
      { users: many },
      { entries: [null] },
      { entries: [] },
      { entries: many },
      { users: [w.bs1, w.s4] },
    ]) {
      expectToken(await issue(sit, o), 'invalid_input')
    }
  })

  it('AC-22: NULL p_user_ids with 501 candidates is invalid_input', async () => {
    const users = bulkUsers(w, 501, 'c501')
    try {
      const sit = await w.sitting({ day: 1 })
      bulkCandidates(w, sit, users)
      expectToken(await issue(sit), 'invalid_input')
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
    }
  }, 120_000)

  it('AC-23: every skip reason is counted and the counts sum to the plan rows', async () => {
    const sit = await w.sitting({ day: 0, state: 'open' })
    await w.code(await w.enter(sit, w.s1, w.subA))
    const taken = await w.enter(sit, w.s2, w.subA)
    await w.code(taken, {
      consumedBy: await w.session(w.s2, w.subA, { ended: true, passed: false }),
    })
    await w.enter(sit, w.s3, w.subA)
    await deactivate(w, w.s3)
    await w.enter(sit, w.s4, w.subA)
    await unenrol(w.s4)
    must(
      await admin
        .from('exam_configs')
        .update({ enabled: false })
        .eq('organization_id', w.orgA)
        .eq('subject_id', w.subB)
        .select('id'),
      'disable',
    )
    await w.enter(sit, w.s1, w.subB)
    const r = out(await issue(sit))
    expect(r).toMatchObject({
      issued: 0,
      reissued_after_expiry: 0,
      skipped_already_issued: 1,
      skipped_attempt_taken: 1,
      skipped_deactivated: 1,
      skipped_not_enrolled: 1,
      skipped_no_config: 1,
      skipped_passed: 0,
    })
    expect(Object.keys(r).sort()).toEqual([...ISSUE_KEYS].sort())
  })

  it('AC-24: an expired unused code is voided reissued_after_expiry and replaced in the same call', async () => {
    const sit = await w.sitting({ day: 1 })
    const e = await w.enter(sit, w.s1, w.subA)
    const old = await w.code(e, { expired: true })
    const e2 = await w.enter(sit, w.s2, w.subA)
    const voidedUnused = await w.code(e2, { voided: true })
    const e3 = await w.enter(sit, w.s4, w.subA)
    await w.code(e3, { consumedBy: await w.session(w.s4, w.subA, { ended: true, passed: false }) })
    const r = out(await issue(sit))
    expect(r.reissued_after_expiry).toBe(1)
    expect(r.issued).toBe(2)
    expect(r.skipped_attempt_taken).toBe(1)
    expect((await w.codeRow(old)).void_reason).toBe('reissued_after_expiry')
    expect(await liveCodes(e)).toHaveLength(1)
    expect(await liveCodes(e2)).toHaveLength(1)
    expect((await w.codeRow(voidedUnused)).void_reason).toBe('manual')
    const voids = (await sittingAudits('internal_exam.code_voided', sit)).filter(
      (a) => a.metadata.reason === 'reissued_after_expiry',
    )
    expect(voids).toHaveLength(1)
    expect(voids[0]?.metadata).toMatchObject({
      reason: 'reissued_after_expiry',
      was_consumed: false,
      sitting_id: sit,
      entry_id: e,
      student_id: w.s1,
      subject_id: w.subA,
    })
    expect(Object.keys(voids[0]?.metadata ?? {}).sort()).toEqual(
      ['entry_id', 'reason', 'sitting_id', 'student_id', 'subject_id', 'was_consumed'].sort(),
    )
  })

  it('AC-25: issue prunes a passed entry first; with a consumed code it is attempt_taken', async () => {
    const sit = await w.sitting({ day: 0, state: 'open' })
    const e1 = await w.enter(sit, w.s1, w.subA)
    const c1 = await w.code(e1)
    await scored(w, w.s1, w.subA, true)
    const e2 = await w.enter(sit, w.s2, w.subA)
    await w.code(e2, { consumedBy: await scored(w, w.s2, w.subA, true) })
    const r = out(await issue(sit))
    expect(r.skipped_attempt_taken).toBe(1)
    expect(r.skipped_passed).toBe(0)
    expect(r.issued).toBe(0)
    expect(
      must<{ deleted_at: string | null }>(
        await admin.from('exam_sitting_entries').select('deleted_at').eq('id', e1).single(),
        'e1',
      ).deleted_at,
    ).not.toBeNull()
    expect((await w.codeRow(c1)).void_reason).toBe('passed_elsewhere')
    expect(await w.audits('exam_sitting.entry_auto_removed', sit)).toHaveLength(1)
  })

  it('AC-27: zero issued is a normal return with no code_issued rows; zero candidates issues nothing', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.code(await w.enter(sit, w.s1, w.subA))
    const r = out(await issue(sit))
    expect(r.issued).toBe(0)
    expect(await sittingAudits('internal_exam.code_issued', sit)).toHaveLength(0)
    const empty = await w.sitting({ day: 2 })
    expect(out(await issue(empty)).issued).toBe(0)
  })

  it('AC-28: removed, other-sitting, org B and unknown entry ids raise entry_not_found and issue nothing', async () => {
    const sit = await w.sitting({ day: 1 })
    const other = await w.sitting({ day: 2 })
    const good = await w.enter(sit, w.s1, w.subA)
    const gone = await w.enter(sit, w.s2, w.subA)
    must(
      await admin
        .from('exam_sitting_entries')
        .update({ deleted_at: now() })
        .eq('id', gone)
        .select('id'),
      'remove',
    )
    const elsewhere = await w.enter(other, w.s4, w.subA)
    const bSit = await w.sitting({ day: 1, org: w.orgB })
    const foreign = await w.entry(bSit, w.bs1, w.subA, w.orgB)
    for (const bad of [gone, elsewhere, foreign, crypto.randomUUID()]) {
      expectToken(await issue(sit, { entries: [good, bad] }), 'entry_not_found')
    }
    expect(await liveCodes(good)).toHaveLength(0)
  })

  it('AC-32 (Q5): an entry id pruned as passed counts skipped_passed, not entry_not_found; an unticked live entry yields no rows', async () => {
    const sit = await w.sitting({ day: 1 })
    const e1 = await w.enter(sit, w.s1, w.subA)
    await scored(w, w.s1, w.subA, true)
    const e2 = await w.enter(sit, w.s2, w.subA)
    const r = out(await issue(sit, { entries: [e1] }))
    expect(r.skipped_passed).toBe(1)
    const none = out(await issue(sit, { users: [w.s1], entries: [e2] }))
    expect(none.issued).toBe(0)
    expect(await liveCodes(e2)).toHaveLength(0)
  })

  it('AC-29: lifecycle tokens, ordering and caller checks', async () => {
    const closed = await w.sitting({ day: 0, state: 'closed' })
    const ended = await w.sitting({ day: -2 })
    const cancelled = await w.sitting({ day: 1, state: 'cancelled' })
    const foreign = await w.sitting({ day: 1, org: w.orgB })
    const open = await w.sitting({ day: 0, state: 'open' })
    expectToken(await issue(closed), 'sitting_closed')
    expectToken(await issue(ended), 'sitting_day_ended')
    expectToken(await issue(cancelled), 'sitting_not_found')
    expectToken(await issue(foreign), 'sitting_not_found')
    expectToken(await issue(closed, { users: [] }), 'invalid_input')
    out(await issue(open))
    expectToken(await issue(open, {}, w.clients.s1), 'not_admin')
    expectToken(await issue(open, {}, w.clients.i1), 'not_admin')
    expectToken(await issue(open, {}, a2Client), 'not_admin')
    expectToken(await issue(open, {}, admin as unknown as typeof w.clients.a1), 'not_authenticated')
    expect((await issue(open, {}, w.clients.anon)).error?.code).toBe('42501')
  })

  it('AC-30: 2000 entries issue in one call under 1.5 s and the per-entry code lookup uses an index', async () => {
    const users = bulkUsers(w, 50, 'iss2k')
    const subs = bulkSubjects(w, 40, 'AI')
    try {
      const sit = await w.sitting({ day: 1 })
      bulkCandidates(w, sit, users)
      bulkEntries(w, sit, users, subs)
      psql('VACUUM ANALYZE public.internal_exam_codes;')
      const t = Date.now()
      const r = out(await issue(sit))
      expect(Date.now() - t).toBeLessThan(1500)
      expect(r.issued).toBe(2000)
      psql('VACUUM ANALYZE public.internal_exam_codes;')
      const plan = psql(
        `EXPLAIN SELECT 1 FROM public.internal_exam_codes WHERE sitting_entry_id = (SELECT id FROM public.exam_sitting_entries WHERE sitting_id = '${sit}' LIMIT 1) AND deleted_at IS NULL;`,
      ).out
      expect(plan).toMatch(/idx_internal_exam_codes_sitting_entry|Index/)
      expect(plan).not.toMatch(/Seq Scan on internal_exam_codes/)
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
      dropBulkSubjects(subs)
    }
  }, 240_000)

  it('AC-62: audit rows carry actor_id = caller and the cached actor_role', async () => {
    const sit = await w.sitting({ day: 1 })
    await w.enter(sit, w.s1, w.subA)
    must(await issue(sit), 'issue')
    const rows = must<Array<{ actor_id: string; actor_role: string }>>(
      await admin
        .from('audit_events')
        .select('actor_id, actor_role')
        .eq('event_type', 'internal_exam.code_issued')
        .eq('metadata->>sitting_id', sit),
      'audit',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_id: w.a1, actor_role: 'admin' })
  })
})
