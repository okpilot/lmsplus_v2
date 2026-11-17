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

/** AC-17..AC-19: private.insert_internal_exam_code (psql). */
describe('private.insert_internal_exam_code', () => {
  let w: World
  beforeAll(async () => {
    w = await buildWorld('ins-code')
  })
  afterAll(async () => {
    await w?.teardown()
  })
  const call = (entry: string, subject: string, student: string, prefix = '') =>
    `${prefix}SELECT private.insert_internal_exam_code('${w.orgA}'::uuid, '${entry}'::uuid, '${subject}'::uuid, '${student}'::uuid, '${w.a1}'::uuid, now() + interval '1 hour');`
  const plant = async (entry: string, code: string) => {
    const e = must<{ user_id: string; subject_id: string }>(
      await admin
        .from('exam_sitting_entries')
        .select('user_id, subject_id')
        .eq('id', entry)
        .single(),
      'entry',
    )
    must(
      await admin
        .from('internal_exam_codes')
        .insert({
          code,
          subject_id: e.subject_id,
          student_id: e.user_id,
          issued_by: w.a1,
          organization_id: w.orgA,
          sitting_entry_id: entry,
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        })
        .select('id'),
      'plant code',
    )
  }

  it('AC-17: returns a code row with 8 charset chars and the entry, org, subject, student and expiry set', async () => {
    const sit = await w.sitting({ day: 1 })
    const e = await w.enter(sit, w.s1, w.subA)
    const r = psql(call(e, w.subA, w.s1))
    expect(r.err).toBe('')
    const id = r.out.split('\n').pop() as string
    const row = must<Record<string, unknown>>(
      await admin.from('internal_exam_codes').select('*').eq('id', id).single(),
      'code row',
    )
    expect(row.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    expect(row).toMatchObject({
      sitting_entry_id: e,
      organization_id: w.orgA,
      subject_id: w.subA,
      student_id: w.s1,
    })
    expect(row.expires_at).not.toBeNull()
  })

  it('AC-18: a second live code for the same entry raises 23505 and is not retried', async () => {
    const sit = await w.sitting({ day: 1 })
    const e = await w.enter(sit, w.s2, w.subA)
    expect(psql(call(e, w.subA, w.s2)).err).toBe('')
    const second = psql(call(e, w.subA, w.s2))
    expect(second.err).toMatch(/duplicate key|23505/)
    const n = psql(
      `SELECT count(*) FROM public.internal_exam_codes WHERE sitting_entry_id = '${e}';`,
    )
    expect(n.out).toBe('1')
  })

  it('AC-19: a code-string collision is retried; five collisions raise code_generation_failed', async () => {
    const sit = await w.sitting({ day: 1 })
    const target = await w.enter(sit, w.s3, w.subA)
    const others = [
      await w.enter(sit, w.s3, w.subB),
      await w.enter(sit, w.s4, w.subA),
      await w.enter(sit, w.s4, w.subB),
      await w.enter(sit, w.s1, w.subB),
      await w.enter(sit, w.s2, w.subB),
    ]
    const seeded = () =>
      psql(
        `BEGIN; SELECT setseed(0.5); SELECT code FROM public.internal_exam_codes WHERE id = private.insert_internal_exam_code('${w.orgA}'::uuid, '${target}'::uuid, '${w.subA}'::uuid, '${w.s3}'::uuid, '${w.a1}'::uuid, now() + interval '1 hour'); ROLLBACK;`,
      )
    const first = seeded()
    expect(first.err).toBe('')
    const c1 = first.out.split('\n').find((l) => /^[A-Z2-9]{8}$/.test(l)) as string
    expect(c1).toMatch(/^[A-Z2-9]{8}$/)
    expect(seeded().out).toContain(c1)
    await plant(others[0] as string, c1)
    const retried = seeded()
    expect(retried.err).toBe('')
    const c2 = retried.out.split('\n').find((l) => /^[A-Z2-9]{8}$/.test(l)) as string
    expect(c2).toMatch(/^[A-Z2-9]{8}$/)
    expect(c2).not.toBe(c1)
    const drawn = [c1, c2]
    for (let i = 1; i < 4; i++) {
      await plant(others[i] as string, drawn[i] as string)
      const r = seeded()
      const c = r.out.split('\n').find((l) => /^[A-Z2-9]{8}$/.test(l)) as string
      expect(c).toBeDefined()
      drawn.push(c)
    }
    await plant(others[4] as string, drawn[4] as string)
    const failed = seeded()
    expect(failed.err).toMatch(/code_generation_failed/)
  })
})
