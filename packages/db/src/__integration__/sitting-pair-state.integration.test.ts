import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { enrolStudent } from '../enrol-students'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { psql } from './psql'
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
/** Soft-delete every live sitting, candidate, entry and void every live code of both orgs. */
function clearSittings(w: World) {
  const orgs = `'${w.orgA}','${w.orgB}'`
  const { err } = psql(
    `UPDATE public.internal_exam_codes SET voided_at = now(), voided_by = issued_by, void_reason = 'manual' WHERE organization_id IN (${orgs}) AND sitting_entry_id IS NOT NULL AND voided_at IS NULL AND consumed_at IS NULL;
UPDATE public.exam_sitting_entries SET deleted_at = now() WHERE organization_id IN (${orgs}) AND deleted_at IS NULL;
UPDATE public.exam_sitting_candidates SET deleted_at = now() WHERE organization_id IN (${orgs}) AND deleted_at IS NULL;
UPDATE public.exam_sittings SET deleted_at = now(), deleted_by = created_by WHERE organization_id IN (${orgs}) AND deleted_at IS NULL AND closed_at IS NULL;`,
  )
  expect(err, 'clear sittings').toBe('')
}
async function restore(w: World) {
  clearSittings(w)
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

type Pair = {
  user: string
  subject: string
  state: string
  entry: string
  live: string
  taken: string
  count: string
  passedAt: string
  score: string
  elseId: string
}

/** AC-1..AC-5: private.sitting_pair_state (psql). */
describe('private.sitting_pair_state', () => {
  let w: World
  beforeAll(async () => {
    w = await buildWorld('pair-sit')
  })
  afterEach(async () => {
    await restore(w)
  })
  afterAll(async () => {
    await w?.teardown()
  })
  const run = (sit: string, users: string[], subjects: string[], org?: string): Pair[] => {
    const { out, err } = psql(
      `SELECT concat_ws('|', user_id, subject_id, state, coalesce(entry_id::text,''), coalesce(has_live_code::text,''), coalesce(attempt_taken::text,''), coalesce(attempt_count::text,''), coalesce(passed_at::text,''), coalesce(passed_score::text,''), coalesce(elsewhere_sitting_id::text,'')) FROM private.sitting_pair_state('${org ?? w.orgA}'::uuid, '${sit}'::uuid, ${arr(users)}, ${arr(subjects)}) ORDER BY user_id, subject_id;`,
    )
    expect(err).toBe('')
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const p = l.split('|')
        return {
          user: p[0] ?? '',
          subject: p[1] ?? '',
          state: p[2] ?? '',
          entry: p[3] ?? '',
          live: p[4] ?? '',
          taken: p[5] ?? '',
          count: p[6] ?? '',
          passedAt: p[7] ?? '',
          score: p[8] ?? '',
          elseId: p[9] ?? '',
        }
      })
  }
  const one = (sit: string, u: string, s: string) => run(sit, [u], [s])[0]

  it('AC-1: one seeded pair per state returns each of the seven states', async () => {
    const x = await w.sitting({ day: 0, state: 'open' })
    const y = await w.sitting({ day: 2 })
    const eHere = await w.enter(x, w.s1, w.subA)
    await w.code(eHere)
    await scored(w, w.s2, w.subA, true)
    await w.session(w.s2, w.subB, { ended: false })
    await w.enter(y, w.s4, w.subA)
    await unenrol(w.s4)
    await deactivate(w, w.s3)
    const got = run(x, [w.s1, w.s2, w.s3, w.s4], [w.subA, w.subB])
    const st = (u: string, s: string) => got.find((p) => p.user === u && p.subject === s)
    expect(st(w.s1, w.subA)?.state).toBe('entered_here')
    expect(st(w.s2, w.subA)?.state).toBe('passed')
    expect(st(w.s2, w.subB)?.state).toBe('attempt_running')
    expect(st(w.s4, w.subA)?.state).toBe('entered_elsewhere')
    expect(st(w.s4, w.subB)?.state).toBe('not_enrolled')
    expect(st(w.s3, w.subA)?.state).toBe('deactivated')
    expect(st(w.s1, w.subB)?.state).toBe('eligible')
    expect(got).toHaveLength(8)
    const here = st(w.s1, w.subA)
    expect(here?.entry).toBe(eHere)
    expect(here?.live).toBe('true')
    expect(here?.taken).toBe('false')
  })

  it('AC-2: entered_here beats passed; passed beats entered_elsewhere', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    await w.enter(x, w.s1, w.subA)
    await scored(w, w.s1, w.subA, true)
    await scored(w, w.s2, w.subA, true)
    await w.enter(y, w.s2, w.subA)
    expect(one(x, w.s1, w.subA)?.state).toBe('entered_here')
    expect(one(x, w.s2, w.subA)?.state).toBe('passed')
  })

  it('AC-2: attempt_running and entered_elsewhere beat not_enrolled; not_enrolled beats deactivated', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    await w.session(w.s1, w.subA, { ended: false })
    await w.enter(y, w.s2, w.subA)
    await unenrol(w.s1)
    await unenrol(w.s2)
    await unenrol(w.s3)
    await deactivate(w, w.s3)
    expect(one(x, w.s1, w.subA)?.state).toBe('attempt_running')
    expect(one(x, w.s2, w.subA)?.state).toBe('entered_elsewhere')
    expect(one(x, w.s3, w.subA)?.state).toBe('not_enrolled')
  })

  it('AC-3: attempt_count counts ended sessions with an unvoided code; legacy pass is passed', async () => {
    const x = await w.sitting({ day: 1 })
    const o = await w.sitting({ day: 0, state: 'open' })
    const o2 = await w.sitting({ day: 0, state: 'open' })
    const e1 = await w.enter(o, w.s1, w.subA)
    await w.code(e1, { consumedBy: await w.session(w.s1, w.subA, { ended: true, passed: false }) })
    const e2 = await w.enter(o2, w.s1, w.subA)
    await w.code(e2, { consumedBy: await w.session(w.s1, w.subA, { ended: true, passed: false }) })
    // a voided attempt is excluded
    const e3 = await w.entry(o, w.s4, w.subA)
    await w.code(e3, {
      voided: true,
      consumedBy: await w.session(w.s4, w.subA, { ended: true, passed: false }),
    })
    expect(one(x, w.s1, w.subA)?.count).toBe('2')
    expect(one(x, w.s4, w.subA)?.count).toBe('0')
    // legacy pass: ended passed session, no code at all
    await scored(w, w.s3, w.subA, true)
    const legacy = one(x, w.s3, w.subA)
    expect(legacy?.state).toBe('passed')
    expect(legacy?.score).toMatch(/^90/)
  })

  it('AC-3: a pass whose consuming code is voided is not passed; passed_at is the latest pass', async () => {
    const x = await w.sitting({ day: 1 })
    const o = await w.sitting({ day: 0, state: 'open' })
    const e = await w.entry(o, w.s1, w.subA)
    await w.code(e, {
      voided: true,
      consumedBy: await w.session(w.s1, w.subA, { ended: true, passed: true }),
    })
    expect(one(x, w.s1, w.subA)?.state).toBe('eligible')
    const first = await scored(w, w.s2, w.subA, true)
    const second = await scored(w, w.s2, w.subA, true)
    must(
      await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date(Date.now() - 7_200_000).toISOString() })
        .eq('id', first)
        .select('id'),
      'older pass',
    )
    must(
      await admin
        .from('quiz_sessions')
        .update({ score_percentage: 95 })
        .eq('id', second)
        .select('id'),
      'newer score',
    )
    const p = one(x, w.s2, w.subA)
    expect(p?.state).toBe('passed')
    expect(p?.score).toMatch(/^95/)
  })

  it('AC-4: entered_elsewhere blocks only for a live entry in another scheduled/open day-live sitting without a finished attempt', async () => {
    const x = await w.sitting({ day: 1 })
    const open = await w.sitting({ day: 0, state: 'open' })
    const sched = await w.sitting({ day: 3 })
    await w.enter(sched, w.s1, w.subA)
    const hit = one(x, w.s1, w.subA)
    expect(hit?.state).toBe('entered_elsewhere')
    expect(hit?.elseId).toBe(sched)
    await w.enter(open, w.s2, w.subA)
    expect(one(x, w.s2, w.subA)?.state).toBe('entered_elsewhere')
    const closed = await w.sitting({ day: 0, state: 'closed' })
    const cancelled = await w.sitting({ day: 4, state: 'cancelled' })
    const ended = await w.sitting({ day: -2, state: 'open' })
    await w.enter(closed, w.s3, w.subA)
    await w.entry(cancelled, w.s3, w.subA)
    await w.entry(ended, w.s3, w.subA)
    expect(one(x, w.s3, w.subA)?.state).toBe('eligible')
    const gone = await w.enter(sched, w.s4, w.subB)
    must(
      await admin
        .from('exam_sitting_entries')
        .update({ deleted_at: now() })
        .eq('id', gone)
        .select('id'),
      'soft delete entry',
    )
    expect(one(x, w.s4, w.subB)?.state).toBe('eligible')
    const fin = await w.entry(sched, w.s4, w.subA)
    await w.code(fin, { consumedBy: await w.session(w.s4, w.subA, { ended: true, passed: false }) })
    expect(one(x, w.s4, w.subA)?.state).toBe('eligible')
  })

  it('AC-4: entries of this sitting never count as elsewhere', async () => {
    const x = await w.sitting({ day: 1 })
    await w.enter(x, w.s1, w.subA)
    const p = one(x, w.s1, w.subA)
    expect(p?.state).toBe('entered_here')
    expect(p?.elseId).toBe('')
  })

  it('AC-5: org B users and subjects, non-students, soft-deleted subjects and empty arrays yield no rows', async () => {
    const x = await w.sitting({ day: 1 })
    expect(run(x, [w.bs1], [w.subA])).toHaveLength(0)
    expect(run(x, [w.a1, w.i1], [w.subA])).toHaveLength(0)
    expect(run(x, [], [w.subA])).toHaveLength(0)
    expect(run(x, [w.s1], [])).toHaveLength(0)
    expect(run(x, [w.s1], [w.subA])).toHaveLength(1)
    expect(run(x, [w.s1], [w.subA], w.orgB)).toHaveLength(0)
    const sub = must<{ id: string }>(
      await admin
        .from('easa_subjects')
        .insert({
          code: `PS${fixtureSuffix()}`,
          name: 'pair soft',
          short: 'PSD',
          sort_order: 9,
          deleted_at: now(),
        })
        .select('id')
        .single(),
      'deleted subject',
    )
    try {
      expect(run(x, [w.s1], [sub.id])).toHaveLength(0)
    } finally {
      await admin.from('easa_subjects').delete().eq('id', sub.id)
    }
  })

  it('AC-5: an org B sitting id never yields entered_here', async () => {
    const bs = await w.sitting({ day: 1, org: w.orgB })
    const bEntry = await w.entry(bs, w.s1, w.subA, w.orgB)
    const fixture = must<{ id: string; organization_id: string; sitting_id: string }>(
      await admin
        .from('exam_sitting_entries')
        .select('id, organization_id, sitting_id')
        .eq('id', bEntry)
        .single(),
      'org B entry',
    )
    expect(fixture).toMatchObject({ organization_id: w.orgB, sitting_id: bs })
    const x = await w.sitting({ day: 1 })
    const inB = run(bs, [w.s1], [w.subA])
    expect(inB).toHaveLength(1)
    expect(inB[0]?.state).toBe('eligible')
    expect(run(x, [w.s1], [w.subA])[0]?.state).toBe('eligible')
  })
})
