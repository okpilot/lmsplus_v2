import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
const suffix = fixtureSuffix()
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

/** AC-35, AC-36: prune of passed pairs and removal notices. */
describe('prune of entries whose student has passed', () => {
  let w: Awaited<ReturnType<typeof buildWorld>>
  beforeAll(async () => {
    w = await buildWorld('prune-sit')
  })
  afterAll(async () => {
    await w?.teardown()
  })
  const a1 = () => w.clients.a1
  const summary = (id: string) => a1().rpc('get_exam_sitting_summary', { p_sitting_id: id })

  it('AC-35: summary prunes only its own sitting, with the specified side effects', async () => {
    const A = await w.sitting({ day: 1 })
    const B = await w.sitting({ day: 0, state: 'open' })
    const eA = await w.enter(A, w.s1, w.subA)
    const eB = await w.enter(B, w.s1, w.subA)
    const cA = await w.code(eA)
    const cB = await w.code(eB)
    const passing = await w.session(w.s1, w.subA, { ended: true, passed: true })
    // untouched: other subject, other student, consumed code, closed sitting, cancelled sitting, voided-consuming pass
    const eOtherSubject = await w.entry(A, w.s1, w.subB)
    await w.candidate(A, w.s2)
    const eOtherStudent = await w.entry(A, w.s2, w.subA)
    const closed = await w.sitting({ day: 0, state: 'closed' })
    const eClosed = await w.enter(closed, w.s1, w.subA)

    must(await summary(A), 'summary A')

    const removed = await admin
      .from('exam_sitting_entries')
      .select('deleted_at')
      .eq('id', eA)
      .single()
    expect(removed.data?.deleted_at).not.toBeNull()
    expect((await w.codeRow(cA)).void_reason).toBe('passed_elsewhere')
    const a = await w.audits('exam_sitting.entry_auto_removed', A)
    expect(a).toHaveLength(1)
    expect(a[0]?.metadata).toMatchObject({
      entry_id: eA,
      user_id: w.s1,
      subject_id: w.subA,
      sitting_id: A,
      passing_session_id: passing,
      passed_at: expect.any(String),
    })
    const cand = await admin
      .from('exam_sitting_candidates')
      .select('deleted_at')
      .eq('sitting_id', A)
      .eq('user_id', w.s1)
      .single()
    expect(cand.data?.deleted_at).toBeNull()
    for (const id of [eB, eOtherSubject, eOtherStudent, eClosed]) {
      expect(
        (await admin.from('exam_sitting_entries').select('deleted_at').eq('id', id).single()).data
          ?.deleted_at,
        id,
      ).toBeNull()
    }
    expect((await w.codeRow(cB)).voided_at).toBeNull()

    must(await summary(A), 'summary A again')
    expect(await w.audits('exam_sitting.entry_auto_removed', A)).toHaveLength(1)

    must(await summary(B), 'summary B')
    expect(
      (await admin.from('exam_sitting_entries').select('deleted_at').eq('id', eB).single()).data
        ?.deleted_at,
    ).not.toBeNull()
    expect((await w.codeRow(cB)).void_reason).toBe('passed_elsewhere')
  })

  it('AC-35: an entry with a consumed code and a pass whose consuming code is voided are not pruned', async () => {
    const sit = await w.sitting({ day: 1 })
    const consumedEntry = await w.enter(sit, w.s2, w.subA)
    await w.code(consumedEntry, { consumedBy: await w.session(w.s2, w.subA, { ended: false }) })
    await w.session(w.s2, w.subA, { ended: true, passed: true })
    const voidedPassEntry = await w.enter(sit, w.s3, w.subA)
    const voidedPass = await w.session(w.s3, w.subA, { ended: true, passed: true })
    await w.code(voidedPassEntry, { consumedBy: voidedPass, voided: true })

    must(await summary(sit), 'summary')

    for (const id of [consumedEntry, voidedPassEntry]) {
      expect(
        (await admin.from('exam_sitting_entries').select('deleted_at').eq('id', id).single()).data
          ?.deleted_at,
        id,
      ).toBeNull()
    }
  })

  it('AC-35: Start and Close also prune', async () => {
    const sched = await w.sitting({ day: 0 })
    const open = await w.sitting({ day: 0, state: 'open' })
    const e1 = await w.enter(sched, w.s4, w.subA)
    const e2 = await w.enter(open, w.s4, w.subA)
    await w.session(w.s4, w.subA, { ended: true, passed: true })
    must(await a1().rpc('start_exam_sitting', { p_sitting_id: sched }), 'start')
    must(await a1().rpc('close_exam_sitting', { p_sitting_id: open }), 'close')
    for (const id of [e1, e2]) {
      expect(
        (await admin.from('exam_sitting_entries').select('deleted_at').eq('id', id).single()).data
          ?.deleted_at,
        id,
      ).not.toBeNull()
    }
  })

  it('AC-36: pending_removal_notices counts the auto-removal and clears after record_exam_sitting_notice', async () => {
    const sit = await w.sitting({ day: 1 })
    const e = await w.enter(sit, w.s1, w.subB)
    await w.session(w.s1, w.subB, { ended: true, passed: true })

    expect(rowOf(must(await summary(sit), 'summary')).pending_removal_notices).toBe(1)
    const list = must<Record<string, unknown>[]>(
      await a1().rpc('get_pending_removal_notices', { p_sitting_id: sit }),
      'list',
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ entry_id: e, user_id: w.s1, subject_id: w.subB })
    expect(list[0]?.passed_at).toBeTruthy()
    expect(list[0]?.removed_at).toBeTruthy()

    must(
      await a1().rpc('record_exam_sitting_notice', {
        p_sitting_id: sit,
        p_kind: 'entry_auto_removed',
        p_entry_ids: [e],
      }),
      'record',
    )

    expect(rowOf(must(await summary(sit), 'summary after')).pending_removal_notices).toBe(0)
    expect(
      must<unknown[]>(
        await a1().rpc('get_pending_removal_notices', { p_sitting_id: sit }),
        'list after',
      ),
    ).toHaveLength(0)
  })
})
