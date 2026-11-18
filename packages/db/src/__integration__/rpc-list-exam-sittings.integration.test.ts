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
  if (r.error) throw new Error(`psql unavailable: ${r.error.message}`)
  const err = (r.stderr ?? '').trim()
  return { out: (r.stdout ?? '').trim(), err: err || (r.status ? `psql exit ${r.status}` : '') }
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
      const errors: unknown[] = []
      let orgsClean = true
      for (const [orgId, ids] of [
        [orgA, userIds],
        [orgB, bUserIds],
      ] as const) {
        try {
          await cleanupTestData({ admin, orgId, userIds: ids })
        } catch (e) {
          orgsClean = false
          errors.push(e)
        }
      }
      if (orgsClean) {
        try {
          await cleanupReferenceData({ admin, refs: [refs, refsB] })
        } catch (e) {
          errors.push(e)
        }
      }
      if (errors.length > 0) throw new AggregateError(errors, 'teardown failed')
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
      expect(c.error, 'candidate lookup').toBeNull()
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

/** AC-42: list_exam_sittings. */
describe('RPC: list_exam_sittings', () => {
  let w: Awaited<ReturnType<typeof buildWorld>>
  const ids: Record<string, string> = {}
  beforeAll(async () => {
    w = await buildWorld('lst-sit')
  })
  async function ensure() {
    if (ids.up2) return
    ids.up2 = await w.sitting({ day: 3, invigilator: w.i1 })
    ids.up1 = await w.sitting({ day: 2 })
    ids.today = await w.sitting({ day: 0, hour: 23 })
    ids.open = await w.sitting({ day: 0, state: 'open' })
    ids.closed = await w.sitting({ day: 0, state: 'closed' })
    ids.cancelled = await w.sitting({ state: 'cancelled' })
    ids.open2 = await w.sitting({ day: 1, state: 'open' })
    ids.closed2 = await w.sitting({ day: 2, state: 'closed' })
    ids.cancelled2 = await w.sitting({ day: 2, state: 'cancelled' })
    ids.other = await w.sitting({ org: w.orgB })
  }
  afterAll(async () => {
    await w?.teardown()
  })
  const list = (scope: string, o: Record<string, unknown> = {}, c = w.clients.a1) =>
    c.rpc('list_exam_sittings', { p_scope: scope, ...o })
  const rows = async (scope: string, o: Record<string, unknown> = {}) =>
    must<Record<string, unknown>[]>(await list(scope, o), `list ${scope}`)

  const ordered = (r: Record<string, unknown>[], dir: 1 | -1) => {
    const t = r.map((x) => new Date(x.scheduled_at as string).getTime())
    expect([...t].sort((x, y) => dir * (x - y))).toEqual(t)
  }

  it('AC-42: upcoming holds scheduled sittings only (today included), ascending', async () => {
    await ensure()
    const up = await rows('upcoming')
    expect(up.map((r) => r.id).sort()).toEqual([ids.today, ids.up1, ids.up2].sort())
    ordered(up, 1)
  })

  it('AC-42: open holds open sittings only, ascending', async () => {
    await ensure()
    const open = await rows('open')
    expect(open.map((r) => r.id).sort()).toEqual([ids.open, ids.open2].sort())
    ordered(open, 1)
  })

  it('AC-42: past holds closed sittings only, descending', async () => {
    await ensure()
    const past = await rows('past')
    expect(past.map((r) => r.id).sort()).toEqual([ids.closed, ids.closed2].sort())
    ordered(past, -1)
  })

  it('AC-42: cancelled holds cancelled sittings only, descending', async () => {
    await ensure()
    const c = await rows('cancelled')
    expect(c.map((r) => r.id).sort()).toEqual([ids.cancelled, ids.cancelled2].sort())
    expect(c.every((r) => r.status === 'cancelled')).toBe(true)
    ordered(c, -1)
  })

  it('AC-42: invalid scope, NULL scope, limit 0 or 201 and offset -1 are invalid_input', async () => {
    await ensure()
    expectToken(await list('x'), 'invalid_input')
    expectToken(await w.clients.a1.rpc('list_exam_sittings', { p_scope: null }), 'invalid_input')
    expectToken(await list('upcoming', { p_limit: 0 }), 'invalid_input')
    expectToken(await list('upcoming', { p_limit: 201 }), 'invalid_input')
    expectToken(await list('upcoming', { p_offset: -1 }), 'invalid_input')
  })

  it('AC-42: paging returns total_count of the whole scope', async () => {
    await ensure()
    const page = await rows('upcoming', { p_limit: 1, p_offset: 1 })
    expect(page).toHaveLength(1)
    expect(page[0]?.total_count).toBe(3)
  })

  it('AC-42: count columns, entries_finished, entries_absent and ended_automatically', async () => {
    await ensure()
    const id = ids.closed as string
    await w.candidate(id, w.s1)
    await w.candidate(id, w.s2)
    const e1 = await w.entry(id, w.s1, w.subA)
    const e2 = await w.entry(id, w.s2, w.subA)
    await w.entry(id, w.s2, w.subB)
    await w.code(e1, { consumedBy: await w.session(w.s1, w.subA, { ended: true, passed: false }) })
    await w.code(e2)
    const row = (await rows('past')).find((r) => r.id === id)
    expect(row).toMatchObject({
      candidates: 2,
      entries: 3,
      entries_without_code: 1,
      entries_finished: 1,
      entries_absent: 2,
      ended_automatically: false,
    })
    const open = (await rows('open')).find((r) => r.id === ids.open)
    expect(open?.entries_absent).toBe(0)
  })

  it('AC-42: invigilator_active is false and the name still shows for a deactivated or demoted invigilator', async () => {
    await ensure()
    const find = async () => (await rows('upcoming')).find((r) => r.id === ids.up2)
    expect((await find())?.invigilator_active).toBe(true)
    expect((await find())?.invigilator_name).toContain('i1')
    await w.setUser(w.i1, { deleted_at: new Date().toISOString() })
    expect(await find()).toMatchObject({ invigilator_active: false })
    expect((await find())?.invigilator_name).toContain('i1')
    await w.setUser(w.i1, { deleted_at: null, role: 'student' })
    expect((await find())?.invigilator_active).toBe(false)
    await w.setUser(w.i1, { role: 'instructor' })
  })

  it('AC-42: results are org-scoped and a student is not_admin', async () => {
    await ensure()
    expect(
      [
        ...(await rows('upcoming')),
        ...(await rows('open')),
        ...(await rows('past')),
        ...(await rows('cancelled')),
      ].map((r) => r.id),
    ).not.toContain(ids.other)
    expectToken(await list('upcoming', {}, w.clients.s1), 'not_admin')
  })

  it('AC-42: the function is VOLATILE', () => {
    expect(psql("SELECT provolatile FROM pg_proc WHERE proname = 'list_exam_sittings';").out).toBe(
      'v',
    )
  })
})
