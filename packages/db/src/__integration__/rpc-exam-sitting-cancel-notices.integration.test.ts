import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
      expect(c.error).toBeNull()
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

/** User decision 2026-11-17: the pending-notice read also lists the emailed, unconsumed codes of an auto-cancelled sitting (kind sitting_cancelled). */
describe('pending notices for an auto-cancelled sitting', () => {
  let w: World
  beforeAll(async () => {
    w = await buildWorld('cnl-sit')
  }, 120_000)
  afterAll(async () => {
    await w?.teardown()
  }, 120_000)

  const pending = async (sit: string) =>
    JSON.stringify(
      must(await w.clients.a1.rpc('get_pending_removal_notices', { p_sitting_id: sit }), 'pending'),
    )

  it('lists emailed unconsumed codes of a cancelled sitting until a sitting_cancelled notice is recorded', async () => {
    const sit = await w.sitting({ day: 1 })
    const c1 = await w.code(await w.enter(sit, w.s1, w.subA), { emailed: true })
    await w.code(await w.enter(sit, w.s2, w.subA))
    must(await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit }), 'cancel')
    expect((await w.codeRow(c1)).void_reason).toBe('sitting_cancelled')
    const before = await pending(sit)
    expect(before).toContain(w.s1)
    expect(before).not.toContain(w.s2)
    must(
      await w.clients.a1.rpc('record_exam_sitting_notice', {
        p_sitting_id: sit,
        p_kind: 'sitting_cancelled',
        p_code_ids: [c1],
      }),
      'record',
    )
    const notices = must<Array<{ metadata: Record<string, unknown> }>>(
      await admin
        .from('audit_events')
        .select('metadata')
        .eq('event_type', 'exam_sitting.notice_emailed')
        .eq('resource_id', sit),
      'notice audit',
    )
    expect(notices.map((n) => n.metadata)).toContainEqual(
      expect.objectContaining({ kind: 'sitting_cancelled', code_id: c1 }),
    )
    expect(await pending(sit)).not.toContain(w.s1)
  })

  it('the summary pending count includes sitting_cancelled rows', async () => {
    const sit = await w.sitting({ day: 1 })
    const c1 = await w.code(await w.enter(sit, w.s1, w.subA), { emailed: true })
    must(await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit }), 'cancel')
    const count = async () =>
      must<Array<{ pending_removal_notices: number }>>(
        await w.clients.a1.rpc('get_exam_sitting_summary', { p_sitting_id: sit }),
        'summary',
      )[0]?.pending_removal_notices
    expect(await count()).toBe(1)
    must(
      await w.clients.a1.rpc('record_exam_sitting_notice', {
        p_sitting_id: sit,
        p_kind: 'sitting_cancelled',
        p_code_ids: [c1],
      }),
      'record',
    )
    expect(await count()).toBe(0)
  })

  it('on a live sitting, cancelled and sitting_cancelled notices are invalid_input', async () => {
    const sit = await w.sitting({ day: 1 })
    const c1 = await w.code(await w.enter(sit, w.s1, w.subA), { emailed: true })
    for (const kind of ['cancelled', 'sitting_cancelled']) {
      expectToken(
        await w.clients.a1.rpc('record_exam_sitting_notice', {
          p_sitting_id: sit,
          p_kind: kind,
          p_code_ids: [c1],
        }),
        'invalid_input',
      )
    }
  })

  it('a changed notice for a voided code is invalid_input', async () => {
    const sit = await w.sitting({ day: 1 })
    const c1 = await w.code(await w.enter(sit, w.s1, w.subA), { emailed: true, voided: true })
    expectToken(
      await w.clients.a1.rpc('record_exam_sitting_notice', {
        p_sitting_id: sit,
        p_kind: 'changed',
        p_code_ids: [c1],
      }),
      'invalid_input',
    )
  })

  it('a changed notice for the code of a removed entry is invalid_input', async () => {
    const sit = await w.sitting({ day: 1 })
    const entry = await w.enter(sit, w.s1, w.subA)
    const c1 = await w.code(entry, { emailed: true })
    must(
      await admin
        .from('exam_sitting_entries')
        .update({ deleted_at: now() })
        .eq('id', entry)
        .is('deleted_at', null)
        .select('id'),
      'remove entry',
    )
    expectToken(
      await w.clients.a1.rpc('record_exam_sitting_notice', {
        p_sitting_id: sit,
        p_kind: 'changed',
        p_code_ids: [c1],
      }),
      'invalid_input',
    )
  })
})

/** #1803 CR fixup: the sitting_cancelled branch needs emailed/unconsumed codes on live entries. */
describe('sitting_cancelled notice scope (cr fixup)', () => {
  let w: World
  beforeAll(async () => {
    w = await buildWorld('cnl-scope')
  }, 120_000)
  afterAll(async () => {
    await w?.teardown()
  }, 120_000)

  /** Cancelled sitting with one code voided sitting_cancelled, seeded directly. */
  async function seedCancelled(o: { emailed: boolean; entryDeleted?: boolean }) {
    const sit = await w.sitting({ day: 1, state: 'cancelled' })
    const entry = await w.enter(sit, w.s1, w.subA)
    const code = await w.code(entry, { emailed: o.emailed, voided: true })
    must(
      await admin
        .from('internal_exam_codes')
        .update({ void_reason: 'sitting_cancelled' })
        .eq('id', code)
        .select('id'),
      'void reason',
    )
    if (o.entryDeleted) {
      must(
        await admin
          .from('exam_sitting_entries')
          .update({ deleted_at: now() })
          .eq('id', entry)
          .select('id'),
        'delete entry',
      )
    }
    return { sit, code }
  }
  const pending = async (sit: string) =>
    JSON.stringify(
      must(await w.clients.a1.rpc('get_pending_removal_notices', { p_sitting_id: sit }), 'pending'),
    )
  const pendingCount = async (sit: string) =>
    must<Array<{ pending_removal_notices: number }>>(
      await w.clients.a1.rpc('get_exam_sitting_summary', { p_sitting_id: sit }),
      'summary',
    )[0]?.pending_removal_notices

  it('a sitting_cancelled notice for a code that was never emailed is invalid_input and writes no audit row', async () => {
    const { sit, code } = await seedCancelled({ emailed: false })
    expectToken(
      await w.clients.a1.rpc('record_exam_sitting_notice', {
        p_sitting_id: sit,
        p_kind: 'sitting_cancelled',
        p_code_ids: [code],
      }),
      'invalid_input',
    )
    expect(await auditCount(w.orgA, 'exam_sitting.notice_emailed', sit)).toBe(0)
  })

  it('a sitting_cancelled code on a deleted entry is absent from the pending read and the summary count', async () => {
    const { sit } = await seedCancelled({ emailed: true, entryDeleted: true })
    expect(await pending(sit)).not.toContain(w.s1)
    expect(await pendingCount(sit)).toBe(0)
  })

  it('control: a sitting_cancelled code on a live entry is listed, counted and recordable', async () => {
    const { sit, code } = await seedCancelled({ emailed: true })
    expect(await pending(sit)).toContain(w.s1)
    expect(await pendingCount(sit)).toBe(1)
    must(
      await w.clients.a1.rpc('record_exam_sitting_notice', {
        p_sitting_id: sit,
        p_kind: 'sitting_cancelled',
        p_code_ids: [code],
      }),
      'record',
    )
    expect(await auditCount(w.orgA, 'exam_sitting.notice_emailed', sit)).toBe(1)
  })
})

/** PR 2e: pending notices are exact (deliverable rows only) and capped by whole students. */
describe('pending notices: whole-student cap and deliverable count', () => {
  let w: World
  beforeAll(async () => {
    w = await buildWorld('cnl-cap')
  }, 120_000)
  afterAll(async () => {
    await w?.teardown()
  }, 120_000)

  type Row = { user_id: string; kind: string; code_id: string | null; entry_id: string | null }
  const pendingRows = async (sit: string) =>
    must<Row[]>(await w.clients.a1.rpc('get_pending_removal_notices', { p_sitting_id: sit }), 'p')
  const summaryCount = async (sit: string) =>
    must<Array<{ pending_removal_notices: number }>>(
      await w.clients.a1.rpc('get_exam_sitting_summary', { p_sitting_id: sit }),
      'summary',
    )[0]?.pending_removal_notices

  it('returns at most 200 rows, whole students only, none for a deactivated student; summary counts emails', async () => {
    wipeSitting(w)
    const users = bulkUsers(w, 30, 'cap')
    const subjects = bulkSubjects(w, 9, 'CPS')
    try {
      const sit = await w.sitting({ day: 1 })
      bulkCandidates(w, sit, users)
      bulkEntries(w, sit, users, subjects)
      bulkCodes(w, sit)
      const em = psql(
        `UPDATE public.internal_exam_codes SET emailed_at = now() WHERE organization_id = '${w.orgA}' AND sitting_entry_id IS NOT NULL;`,
      )
      expect(em.err).toBe('')
      must(await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit }), 'cancel')
      const dead = users[0] as string
      await w.setUser(dead, { deleted_at: now() })

      const got = await pendingRows(sit)
      expect(got.length).toBeGreaterThan(0)
      expect(got.length).toBeLessThanOrEqual(200)
      expect(got.some((r) => r.user_id === dead)).toBe(false)
      const per = new Map<string, number>()
      for (const r of got) per.set(r.user_id, (per.get(r.user_id) ?? 0) + 1)
      for (const [u, n] of per) expect(n, `rows of ${u}`).toBe(9)
      expect(per.size).toBeLessThan(29)

      // cancellation notices: one email per active student (29), not per row (261).
      expect(await summaryCount(sit)).toBe(29)
    } finally {
      wipeSitting(w)
      dropBulkUsers(users)
      dropBulkSubjects(subjects)
    }
  }, 180_000)

  it('summary counts one email per student for a cancellation and one per entry for a removal', async () => {
    wipeSitting(w)
    const sit = await w.sitting({ day: 1 })
    await w.code(await w.enter(sit, w.s1, w.subA), { emailed: true })
    await w.code(await w.enter(sit, w.s1, w.subB), { emailed: true })
    await w.code(await w.enter(sit, w.s2, w.subA), { emailed: true })
    must(await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit }), 'cancel')
    expect(await summaryCount(sit)).toBe(2)
    expect((await pendingRows(sit)).length).toBe(3)
  })
})
