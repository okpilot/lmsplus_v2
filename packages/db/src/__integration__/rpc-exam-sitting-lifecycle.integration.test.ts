import { spawnSync } from 'node:child_process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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

/** AC-26..AC-31: start / close / cancel lifecycle. */
describe('RPC: start, close, cancel exam sitting', () => {
  let w: Awaited<ReturnType<typeof buildWorld>>
  beforeAll(async () => {
    w = await buildWorld('life-sit')
  })
  afterEach(async () => {
    await w?.resetSessions()
  })
  afterAll(async () => {
    await w?.teardown()
  })
  const a1 = () => w.clients.a1
  const start = (id: string) => a1().rpc('start_exam_sitting', { p_sitting_id: id })
  const close = (id: string) => a1().rpc('close_exam_sitting', { p_sitting_id: id })
  const cancel = (id: string) => a1().rpc('cancel_exam_sitting', { p_sitting_id: id })

  it('AC-26: Start of a sitting dated today opens it, re-stamps unused and expired codes, and audits', async () => {
    const id = await w.sitting({ day: 0, hour: 23 })
    const e1 = await w.enter(id, w.s1, w.subA)
    const e2 = await w.enter(id, w.s2, w.subA)
    const e3 = await w.enter(id, w.s3, w.subA)
    const e4 = await w.enter(id, w.s4, w.subA)
    const unused = await w.code(e1)
    const expired = await w.code(e2, { expired: true })
    const voided = await w.code(e3, { voided: true })
    const consumed = await w.code(e4, { consumedBy: await w.session(w.s4, w.subA) })
    const vBefore = (await w.codeRow(voided)).expires_at
    const cBefore = (await w.codeRow(consumed)).expires_at

    const row = rowOf(must(await start(id), 'start'))

    expect(row.codes_restamped).toBe(2)
    expect(row.invigilator_active).toBe(true)
    expect(row.entries_without_code).toBe(1)
    expect(row.started_at).toBeTruthy()
    const s = await w.sittingRow(id)
    expect(s).toMatchObject({ status: 'open', started_by: w.a1 })
    for (const c of [unused, expired]) {
      expect(new Date((await w.codeRow(c)).expires_at as string).getTime()).toBe(dayEndMinus1us(0))
    }
    expect((await w.codeRow(voided)).expires_at).toBe(vBefore)
    expect((await w.codeRow(consumed)).expires_at).toBe(cBefore)
    expect(await w.audits('exam_sitting.started', id)).toHaveLength(1)
  })

  it('AC-26: an empty sitting starts, and an earlier time of day today is fine', async () => {
    const id = await w.sitting({ day: 0, hour: 0 })
    must(await start(id), 'start empty')
    expect((await w.sittingRow(id)).status).toBe('open')
  })

  it('AC-26: invigilator_active is false for a deactivated or demoted invigilator', async () => {
    const dead = await w.sitting({ day: 0, invigilator: w.i1 })
    await w.setUser(w.i1, { deleted_at: new Date().toISOString() })
    expect(rowOf(must(await start(dead), 'start deactivated')).invigilator_active).toBe(false)
    await w.setUser(w.i1, { deleted_at: null, role: 'student' })
    const demoted = await w.sitting({ day: 0, invigilator: w.i1 })
    expect(rowOf(must(await start(demoted), 'start demoted')).invigilator_active).toBe(false)
    await w.setUser(w.i1, { role: 'instructor' })
  })

  it('AC-26: entries_without_code is 2 for 3 entries with 1 live code', async () => {
    const id = await w.sitting({ day: 0 })
    const e1 = await w.enter(id, w.s1, w.subA)
    await w.enter(id, w.s2, w.subA)
    await w.enter(id, w.s3, w.subA)
    await w.code(e1)
    expect(rowOf(must(await start(id), 'start')).entries_without_code).toBe(2)
  })

  it('AC-27: Start refusals follow the order closed, day-ended, not scheduled, not due, not found', async () => {
    expectToken(await start(await w.sitting({ day: 0, state: 'closed' })), 'sitting_closed')
    expectToken(await start(await w.sitting({ day: -1 })), 'sitting_day_ended')
    expectToken(await start(await w.sitting({ day: 0, state: 'open' })), 'sitting_not_scheduled')
    expectToken(await start(await w.sitting({ state: 'cancelled' })), 'sitting_not_found')
  })

  it('AC-27: a sitting tomorrow is sitting_not_due, leaving the row, audit and codes untouched', async () => {
    const id = await w.sitting({ day: 1 })
    const e = await w.enter(id, w.s1, w.subA)
    const code = await w.code(e, { expired: true })
    const before = await w.sittingRow(id)
    const codeBefore = (await w.codeRow(code)).expires_at

    expectToken(await start(id), 'sitting_not_due')

    expect(await w.sittingRow(id)).toEqual(before)
    expect((await w.codeRow(code)).expires_at).toBe(codeBefore)
    expect(await w.audits('exam_sitting.started', id)).toHaveLength(0)

    must(
      await a1().rpc('update_exam_sitting', { p_sitting_id: id, p_scheduled_at: at(0, 23) }),
      'reschedule to today',
    )
    must(await start(id), 'start after reschedule')
  })

  it('AC-28: Start prunes a passed pair and lazy-closes only own-org day-ended open sittings', async () => {
    const stale = await w.sitting({ day: -2, state: 'open' })
    const staleB = await w.sitting({ day: -2, state: 'open', org: w.orgB })
    const id = await w.sitting({ day: 0 })
    const entry = await w.enter(id, w.s1, w.subA)
    const code = await w.code(entry)
    await w.session(w.s1, w.subA, { ended: true, passed: true })

    must(await start(id), 'start')

    const entryRow = await admin
      .from('exam_sitting_entries')
      .select('deleted_at')
      .eq('id', entry)
      .single()
    expect(entryRow.error).toBeNull()
    expect(entryRow.data?.deleted_at).toEqual(expect.any(String))
    expect((await w.codeRow(code)).void_reason).toBe('passed_elsewhere')
    expect((await w.audits('exam_sitting.entry_auto_removed', id)).length).toBe(1)
    expect((await w.sittingRow(stale)).status).toBe('closed')
    expect((await w.sittingRow(staleB)).status).toBe('open')
  })

  it('AC-29: Close voids unused codes, counts running and absent, leaves consumed codes alone', async () => {
    const id = await w.sitting({ day: 0, state: 'open' })
    const eUnused = await w.enter(id, w.s1, w.subA)
    const eRunning = await w.enter(id, w.s2, w.subA)
    const eDone = await w.enter(id, w.s3, w.subA)
    const unused = await w.code(eUnused)
    const running = await w.session(w.s2, w.subA, { ended: false })
    const done = await w.session(w.s3, w.subA, { ended: true, passed: false })
    const cRunning = await w.code(eRunning, { consumedBy: running })
    const cDone = await w.code(eDone, { consumedBy: done })

    const row = rowOf(must(await close(id), 'close'))

    expect(row).toMatchObject({ codes_voided: 1, attempts_running: 1, absent_count: 1 })
    expect(row.closed_at).toBeTruthy()
    expect(await w.audits('exam_sitting.closed', id).then((a) => a[0]?.metadata)).toMatchObject({
      codes_voided: 1,
      attempts_running: 1,
      absent_count: 1,
      automatic: false,
    })
    expect(await w.codeRow(unused)).toMatchObject({ void_reason: 'sitting_closed' })
    expect((await w.codeRow(unused)).voided_at).not.toBeNull()
    expect((await w.codeRow(cRunning)).voided_at).toBeNull()
    expect((await w.codeRow(cDone)).voided_at).toBeNull()
    const voidAudits = (await w.audits('internal_exam.code_voided')).filter(
      (a) => a.metadata.sitting_id === id,
    )
    expect(voidAudits).toHaveLength(1)
    expect(voidAudits[0]?.metadata.reason).toBe('sitting_closed')
    const fin = await w.clients.s2.rpc('finish_quiz_session', {
      p_session_id: running,
      p_device_id: null,
    })
    expect(fin.error).toBeNull()
    const sessionRow = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', running)
      .single()
    expect(sessionRow.error).toBeNull()
    expect(sessionRow.data?.ended_at).toEqual(expect.any(String))
  })

  it('AC-29: Close of a scheduled sitting is sitting_not_open and a second Close is sitting_closed', async () => {
    expectToken(await close(await w.sitting({ day: 0 })), 'sitting_not_open')
    const id = await w.sitting({ day: 0, state: 'open' })
    must(await close(id), 'close')
    expectToken(await close(id), 'sitting_closed')
  })

  it('AC-29: a manual Close of a day-ended open sitting works with ended_automatically=false', async () => {
    const id = await w.sitting({ day: -2, state: 'open' })
    must(await close(id), 'close day-ended')
    const s = await w.sittingRow(id)
    expect(s.ended_automatically).toBe(false)
    expect(Math.abs(new Date(s.closed_at as string).getTime() - Date.now())).toBeLessThan(60_000)
  })

  it('AC-29: Close prunes first, so a passed entry is removed and not counted absent', async () => {
    const id = await w.sitting({ day: 0, state: 'open' })
    await w.enter(id, w.s4, w.subA)
    await w.session(w.s4, w.subA, { ended: true, passed: true })
    expect(rowOf(must(await close(id), 'close')).absent_count).toBe(0)
    expect((await w.audits('exam_sitting.entry_auto_removed', id)).length).toBe(1)
  })

  it('AC-30: Cancel of a scheduled and an open sitting voids codes and keeps candidate and entry rows', async () => {
    for (const state of ['scheduled', 'open'] as const) {
      const id = await w.sitting({ day: 0, state })
      const eEmailed = await w.enter(id, w.s1, w.subA)
      const eQuiet = await w.enter(id, w.s2, w.subA)
      const emailed = await w.code(eEmailed, { emailed: true })
      await w.code(eQuiet)

      const row = rowOf(must(await cancel(id), `cancel ${state}`))

      expect(row.codes_voided).toBe(2)
      expect(row.notify_code_ids).toEqual([emailed])
      expect(await w.sittingRow(id)).toMatchObject({ status: 'cancelled', deleted_by: w.a1 })
      expect((await w.codeRow(emailed)).void_reason).toBe('sitting_cancelled')
      expect((await w.audits('exam_sitting.cancelled', id))[0]?.metadata).toMatchObject({
        codes_voided: 2,
      })
      const rows = await admin
        .from('exam_sitting_entries')
        .select('deleted_at')
        .eq('sitting_id', id)
      expect(rows.data?.every((r) => r.deleted_at === null)).toBe(true)
      expect(rows.data).toHaveLength(2)
    }
  })

  it('AC-30: Cancel with a consumed code, even terminated or consumed-then-voided, is sitting_has_attempts and changes nothing', async () => {
    for (const variant of ['plain', 'voided'] as const) {
      const id = await w.sitting({ day: 0, state: 'open' })
      const entry = await w.enter(id, w.s1, w.subA)
      const code = await w.code(entry, {
        consumedBy: await w.session(w.s1, w.subA, { ended: false }),
        voided: variant === 'voided',
      })
      expectToken(await cancel(id), 'sitting_has_attempts')
      expect((await w.sittingRow(id)).status).toBe('open')
      expect((await w.codeRow(code)).consumed_at).not.toBeNull()
      await w.resetSessions()
    }
  })

  it('AC-30: Cancel of closed is sitting_closed and of cancelled is sitting_not_found', async () => {
    expectToken(await cancel(await w.sitting({ day: 0, state: 'closed' })), 'sitting_closed')
    expectToken(await cancel(await w.sitting({ state: 'cancelled' })), 'sitting_not_found')
  })

  it('AC-30: a manual Cancel of a day-ended scheduled sitting works with ended_automatically=false', async () => {
    const id = await w.sitting({ day: -2 })
    must(await cancel(id), 'cancel day-ended')
    expect(await w.sittingRow(id)).toMatchObject({
      status: 'cancelled',
      ended_automatically: false,
    })
  })

  it('AC-31: every mutating RPC on a closed sitting is sitting_closed and on a cancelled one sitting_not_found', async () => {
    const calls = (id: string): Array<[string, Record<string, unknown>]> => [
      ['update_exam_sitting', { p_sitting_id: id, p_mode: 'in_person' }],
      ['start_exam_sitting', { p_sitting_id: id }],
      ['close_exam_sitting', { p_sitting_id: id }],
      ['cancel_exam_sitting', { p_sitting_id: id }],
      ['add_exam_sitting_candidates', { p_sitting_id: id, p_user_ids: [w.s1] }],
      ['remove_exam_sitting_candidates', { p_sitting_id: id, p_user_ids: [w.s1] }],
      ['remove_exam_sitting_entries', { p_sitting_id: id, p_entry_ids: [BAD] }],
    ]
    const closed = await w.sitting({ day: 0, state: 'closed' })
    const gone = await w.sitting({ state: 'cancelled' })
    for (const [fn, args] of calls(closed)) {
      expect((await a1().rpc(fn, args)).error?.message, `closed ${fn}`).toBe('sitting_closed')
    }
    for (const [fn, args] of calls(gone)) {
      expect((await a1().rpc(fn, args)).error?.message, `cancelled ${fn}`).toBe('sitting_not_found')
    }
  })
})
