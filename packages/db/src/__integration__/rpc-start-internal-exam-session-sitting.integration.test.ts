import { spawn, spawnSync } from 'node:child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { psql } from './psql'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * PR 2a-2 (#1777): start_internal_exam_session redeem gate for sitting codes.
 * Sitting FOR SHARE before code FOR UPDATE; sitting_not_open / already_passed; audit sitting keys.
 */
const admin = getAdminClient()
const suffix = fixtureSuffix()
const PW = 'test-pass-123'
const DAY = 86_400_000
const RACE_N = 6

const dayStart = (offset = 0) => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() + offset * DAY)
}
const at = (offset: number, hour = 9) =>
  new Date(dayStart(offset).getTime() + hour * 3_600_000).toISOString()

type Res = { data: unknown; error: { message: string; code?: string } | null }
const msg = (r: Res) => r.error?.message ?? 'ok'
const must = <T = Record<string, unknown>>(r: Res, label: string): T => {
  expect(r.error, label).toBeNull()
  expect(r.data, label).not.toBeNull()
  return r.data as T
}

const PSQL_ARGS = ['-U', 'postgres', '-d', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1']

/** Hold a lock in a background psql session for `seconds`; resolves when it commits. */
function holdLock(lockSql: string, seconds: number): Promise<void> {
  const hostPsql = !spawnSync('psql', ['--version']).error
  const p = hostPsql
    ? spawn('psql', ['-h', 'localhost', '-p', '54322', ...PSQL_ARGS], {
        env: { ...process.env, PGPASSWORD: 'postgres' },
      })
    : spawn('docker', ['exec', '-i', 'supabase_db_lmsplusv2', 'psql', ...PSQL_ARGS])
  return new Promise((resolve, reject) => {
    p.on('error', reject)
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`holdLock exit ${c}`))))
    p.stdin.end(`BEGIN; ${lockSql}; SELECT pg_sleep(${seconds}); COMMIT;`)
  })
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('RPC: start_internal_exam_session sitting redeem gate (#1777)', () => {
  let orgA: string
  let orgB: string
  let adminId: string
  let adminBId: string
  let subA: string
  let subB: string
  let refsA: Awaited<ReturnType<typeof seedReferenceData>>
  let refsB: Awaited<ReturnType<typeof seedReferenceData>>
  let adminClient: SupabaseClient
  let n = 0
  const userIdsA: string[] = []
  const userIdsB: string[] = []

  /** createTestUser auto-enrols; an unenrolled student has the enrolment soft-deleted. */
  const unenrol = async (userId: string) => {
    const { error } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (error) throw new Error(`unenrol: ${error.message}`)
  }
  async function student(tag: string, o: { enrolled?: boolean; org?: string } = {}) {
    const org = o.org ?? orgA
    const email = `${tag}-${++n}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId: org, email, password: PW, role: 'student' })
    ;(org === orgA ? userIdsA : userIdsB).push(id)
    if (o.enrolled === false) await unenrol(id)
    return { id, client: await getAuthenticatedClient({ email, password: PW }) }
  }
  type Stu = Awaited<ReturnType<typeof student>>

  async function sitting(o: { day?: number; hour?: number; state?: 'scheduled' | 'open' } = {}) {
    const scheduled = at(o.day ?? 0, o.hour ?? 0)
    const row: Record<string, unknown> = {
      organization_id: orgA,
      scheduled_at: scheduled,
      mode: 'remote',
      invigilator_id: adminId,
      created_by: adminId,
    }
    if (o.state === 'open') {
      row.started_at = new Date(
        Math.min(Date.now() - 2000, new Date(scheduled).getTime()),
      ).toISOString()
      row.started_by = adminId
    }
    const r = await admin.from('exam_sittings').insert(row).select('id').single()
    return must<{ id: string }>(r, 'sitting').id
  }
  async function entry(sittingId: string, userId: string, subjectId: string) {
    const { data: cands, error: cErr } = await admin
      .from('exam_sitting_candidates')
      .select('id')
      .eq('sitting_id', sittingId)
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (cErr) throw new Error(`candidate lookup: ${cErr.message}`)
    if (!cands?.length) {
      must(
        await admin
          .from('exam_sitting_candidates')
          .insert({ organization_id: orgA, sitting_id: sittingId, user_id: userId })
          .select('id')
          .single(),
        'candidate',
      )
    }
    const r = await admin
      .from('exam_sitting_entries')
      .insert({
        organization_id: orgA,
        sitting_id: sittingId,
        user_id: userId,
        subject_id: subjectId,
      })
      .select('id')
      .single()
    return must<{ id: string }>(r, 'entry').id
  }
  async function sittingCode(
    entryId: string,
    userId: string,
    subjectId: string,
    expiresAt?: string,
  ) {
    const row = {
      code: `RG${suffix}${++n}`.slice(0, 30),
      subject_id: subjectId,
      student_id: userId,
      issued_by: adminId,
      organization_id: orgA,
      sitting_entry_id: entryId,
      expires_at: expiresAt ?? new Date(Date.now() + 7_200_000).toISOString(),
    }
    const r = await admin.from('internal_exam_codes').insert(row).select('id, code').single()
    return must<{ id: string; code: string }>(r, 'code')
  }
  /** sitting + entry + code in one go. */
  async function world(
    s: Stu,
    o: { day?: number; hour?: number; state?: 'scheduled' | 'open'; subject?: string } = {},
  ) {
    const sid = await sitting(o)
    const subject = o.subject ?? subA
    const eid = await entry(sid, s.id, subject)
    const code = await sittingCode(eid, s.id, subject)
    return { sid, eid, ...code }
  }
  async function legacyCode(userId: string, subjectId: string, org = orgA) {
    const r = await admin
      .from('internal_exam_codes')
      .insert({
        code: `RL${suffix}${++n}`.slice(0, 30),
        subject_id: subjectId,
        student_id: userId,
        issued_by: org === orgA ? adminId : adminBId,
        organization_id: org,
        expires_at: new Date(Date.now() + 7_200_000).toISOString(),
      })
      .select('id, code')
      .single()
    return must<{ id: string; code: string }>(r, 'legacy code')
  }
  const codeRow = async (id: string) =>
    must<{ consumed_at: string | null; voided_at: string | null; expires_at: string }>(
      await admin
        .from('internal_exam_codes')
        .select('consumed_at, voided_at, expires_at')
        .eq('id', id)
        .single(),
      'code row',
    )
  const sessionsOf = async (studentId: string) =>
    must<Array<{ id: string }>>(
      await admin
        .from('quiz_sessions')
        .select('id')
        .eq('student_id', studentId)
        .eq('mode', 'internal_exam')
        .is('deleted_at', null),
      'sessions',
    )
  const startedAudits = async (studentId: string) =>
    must<Array<{ metadata: Record<string, unknown> }>>(
      await admin
        .from('audit_events')
        .select('metadata')
        .eq('event_type', 'internal_exam.started')
        .eq('actor_id', studentId),
      'audits',
    )
  const redeem = (s: Stu, code: string) =>
    s.client.rpc('start_internal_exam_session', { p_code: code }) as unknown as Promise<Res>
  const resetSessions = async (studentId: string) => {
    must(
      (await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .select('id')) as Res,
      'reset sessions',
    )
  }
  async function seedPassedSession(studentId: string, subjectId: string) {
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
        ended_at: new Date(Date.now() - 1_800_000).toISOString(),
        passed: true,
      })
      .select('id')
      .single()
    return must<{ id: string }>(r, 'passed session').id
  }

  async function seedRunningSession(studentId: string, subjectId: string) {
    const r = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgA,
        student_id: studentId,
        mode: 'internal_exam',
        subject_id: subjectId,
        config: { pass_mark: 75, question_ids: [] },
        total_questions: 0,
        started_at: new Date(Date.now() - 60_000).toISOString(),
        ended_at: null,
        time_limit_seconds: null,
      })
      .select('id')
      .single()
    return must<{ id: string }>(r, 'running session').id
  }

  beforeAll(async () => {
    orgA = await createTestOrg({ admin, name: `Redeem Gate A ${suffix}`, slug: `rg-a-${suffix}` })
    orgB = await createTestOrg({ admin, name: `Redeem Gate B ${suffix}`, slug: `rg-b-${suffix}` })
    const mkAdmin = async (org: string, tag: string, ids: string[]) => {
      const email = `rg-${tag}-${suffix}@test.local`
      const id = await createTestUser({ admin, orgId: org, email, password: PW, role: 'admin' })
      ids.push(id)
      return { id, email }
    }
    const a = await mkAdmin(orgA, 'adm', userIdsA)
    adminId = a.id
    adminBId = (await mkAdmin(orgB, 'admb', userIdsB)).id
    adminClient = await getAuthenticatedClient({ email: a.email, password: PW })
    refsA = await seedReferenceData({
      admin,
      subjectCode: `RGA${suffix}`,
      subjectName: `Redeem Gate A ${suffix}`,
      topicCode: `RGA${suffix}-01`,
      topicName: `Redeem Gate A Topic ${suffix}`,
    })
    refsB = await seedReferenceData({
      admin,
      subjectCode: `RGB${suffix}`,
      subjectName: `Redeem Gate B ${suffix}`,
      topicCode: `RGB${suffix}-01`,
      topicName: `Redeem Gate B Topic ${suffix}`,
    })
    subA = refsA.subjectId
    subB = refsB.subjectId
    for (const refs of [refsA, refsB]) {
      await seedQuestions({
        admin,
        orgId: orgA,
        createdBy: adminId,
        subjectId: refs.subjectId,
        topicId: refs.topicId,
        count: 5,
      })
      const { data: cfg, error } = await admin
        .from('exam_configs')
        .insert({
          organization_id: orgA,
          subject_id: refs.subjectId,
          enabled: true,
          total_questions: 1,
          time_limit_seconds: 1800,
          pass_mark: 75,
        })
        .select('id')
        .single()
      if (error || !cfg) throw new Error(`exam_config: ${error?.message}`)
      const d = await admin.from('exam_config_distributions').insert({
        exam_config_id: cfg.id,
        topic_id: refs.topicId,
        subtopic_id: null,
        question_count: 1,
      })
      if (d.error) throw new Error(`distribution: ${d.error.message}`)
    }
  })

  afterAll(async () => {
    const errors: unknown[] = []
    for (const [org, ids] of [
      [orgA, userIdsA],
      [orgB, userIdsB],
    ] as const) {
      try {
        await cleanupTestData({ admin, orgId: org, userIds: ids })
      } catch (e) {
        errors.push(e)
      }
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refsA, refsB] })
      } catch (e) {
        errors.push(e)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'teardown failed')
  })

  describe('I-RED: sitting codes', () => {
    it('AC-RED: a code of a scheduled sitting raises sitting_not_open with no side effects', async () => {
      const s = await student('red-sched')
      const w = await world(s, { day: 1, state: 'scheduled' })
      const disc = await admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgA,
          student_id: s.id,
          mode: 'discovery',
          subject_id: subA,
          config: { question_ids: [] },
          total_questions: 0,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      const discId = must<{ id: string }>(disc, 'discovery row').id
      const r = await redeem(s, w.code)
      expect(msg(r)).toBe('sitting_not_open')
      expect(await sessionsOf(s.id)).toEqual([])
      expect((await codeRow(w.id)).consumed_at).toBeNull()
      expect(await startedAudits(s.id)).toEqual([])
      const d = await admin.from('quiz_sessions').select('deleted_at').eq('id', discId).single()
      expect(d.data?.deleted_at).toBeNull()
    })

    it('AC-RED: a code of an open sitting starts and the started audit carries sitting_id and sitting_entry_id', async () => {
      const s = await student('red-open')
      const w = await world(s, { day: 0, state: 'open' })
      const r = await redeem(s, w.code)
      expect(msg(r)).toBe('ok')
      expect((await codeRow(w.id)).consumed_at).not.toBeNull()
      const audits = await startedAudits(s.id)
      expect(audits).toHaveLength(1)
      expect(audits[0]?.metadata).toMatchObject({ sitting_id: w.sid, sitting_entry_id: w.eid })
    })

    it('AC-RED: after Close the code is voided and raises code_voided', async () => {
      const s = await student('red-close')
      const w = await world(s, { day: 0, state: 'open' })
      must((await adminClient.rpc('close_exam_sitting', { p_sitting_id: w.sid })) as Res, 'close')
      expect(msg(await redeem(s, w.code))).toBe('code_voided')
    })

    it('AC-RED: after cancel the code raises code_voided', async () => {
      const s = await student('red-cancel')
      const w = await world(s, { day: 1, state: 'scheduled' })
      must((await adminClient.rpc('cancel_exam_sitting', { p_sitting_id: w.sid })) as Res, 'cancel')
      expect(msg(await redeem(s, w.code))).toBe('code_voided')
    })

    it('AC-RED: after entry removal the code raises code_voided', async () => {
      const s = await student('red-remove')
      const w = await world(s, { day: 1, state: 'scheduled' })
      must(
        (await adminClient.rpc('remove_exam_sitting_entries', {
          p_sitting_id: w.sid,
          p_entry_ids: [w.eid],
        })) as Res,
        'remove',
      )
      expect(msg(await redeem(s, w.code))).toBe('code_voided')
    })

    it('AC-RED: a day-ended sitting with an unmodified expiry raises code_expired', async () => {
      const s = await student('red-dayend-exp')
      const sid = await sitting({ day: -1, state: 'open' })
      const eid = await entry(sid, s.id, subA)
      const c = await sittingCode(eid, s.id, subA, new Date(Date.now() - 1000).toISOString())
      expect(msg(await redeem(s, c.code))).toBe('code_expired')
    })

    it('AC-RED: a day-ended open sitting with a forged future expiry raises sitting_not_open', async () => {
      const s = await student('red-dayend-fwd')
      const w = await world(s, { day: -1, state: 'open' })
      expect(msg(await redeem(s, w.code))).toBe('sitting_not_open')
      expect((await codeRow(w.id)).consumed_at).toBeNull()
    })

    it('AC-RED: a pass since issue raises already_passed for a sitting code', async () => {
      const s = await student('red-passed')
      const w = await world(s, { day: 0, state: 'open' })
      await seedPassedSession(s.id, subA)
      const before = (await sessionsOf(s.id)).length
      expect(msg(await redeem(s, w.code))).toBe('already_passed')
      expect((await codeRow(w.id)).consumed_at).toBeNull()
      expect(await sessionsOf(s.id)).toHaveLength(before)
    })

    it('AC-3: a passed student with a running same-subject session gets active_session_exists', async () => {
      const s = await student('red-passed-running')
      const w = await world(s, { day: 0, state: 'open' })
      await seedPassedSession(s.id, subA)
      await seedRunningSession(s.id, subA)
      expect(msg(await redeem(s, w.code))).toBe('active_session_exists')
      expect((await codeRow(w.id)).consumed_at).toBeNull()
    })

    it('AC-4: a passed student with a running session in another subject gets another_session_active', async () => {
      const s = await student('red-passed-other')
      const w = await world(s, { day: 0, state: 'open', subject: subA })
      await seedPassedSession(s.id, subA)
      await seedRunningSession(s.id, subB)
      expect(msg(await redeem(s, w.code))).toBe('another_session_active')
      expect((await codeRow(w.id)).consumed_at).toBeNull()
    })

    it('AC-RED: a prior pass does not block a legacy code', async () => {
      const s = await student('red-passed-leg')
      await seedPassedSession(s.id, subA)
      const c = await legacyCode(s.id, subA)
      expect(msg(await redeem(s, c.code))).toBe('ok')
    })

    it('AC-RED: not enrolled raises not_enrolled before the gate on a scheduled sitting', async () => {
      const s = await student('red-noenrol', { enrolled: false })
      const w = await world(s, { day: 1, state: 'scheduled' })
      expect(msg(await redeem(s, w.code))).toBe('not_enrolled')
    })

    it('AC-RED: a non-owner gets code_not_yours for scheduled and open sittings', async () => {
      const owner = await student('red-owner')
      const other = await student('red-other')
      const sched = await world(owner, { day: 1, state: 'scheduled' })
      const open = await world(owner, { day: 0, state: 'open' })
      expect(msg(await redeem(other, sched.code))).toBe('code_not_yours')
      expect(msg(await redeem(other, open.code))).toBe('code_not_yours')
    })

    it('AC-RED: a cross-org caller gets code_not_yours', async () => {
      const owner = await student('red-xorg-owner')
      const foreign = await student('red-xorg', { org: orgB })
      const w = await world(owner, { day: 0, state: 'open' })
      expect(msg(await redeem(foreign, w.code))).toBe('code_not_yours')
    })

    it('AC-RED: a second subject while the first runs raises another_session_active', async () => {
      const s = await student('red-two')
      const first = await world(s, { day: 0, state: 'open', subject: subA })
      expect(msg(await redeem(s, first.code))).toBe('ok')
      const second = await world(s, { day: 0, state: 'open', subject: subB })
      expect(msg(await redeem(s, second.code))).toBe('another_session_active')
    })

    it('AC-RED: a deactivated student is refused as inactive and succeeds once reactivated', async () => {
      const s = await student('red-deact')
      const w = await world(s, { day: 0, state: 'open' })
      await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', s.id)
      expect(msg(await redeem(s, w.code))).toMatch(/user not found or inactive/)
      await admin.from('users').update({ deleted_at: null }).eq('id', s.id)
      expect(msg(await redeem(s, w.code))).toBe('ok')
    })
  })

  describe('I-LEG: legacy codes', () => {
    it('AC-LEG: a legacy NULL-entry code redeems and the audit sitting_id is null', async () => {
      const s = await student('leg')
      const c = await legacyCode(s.id, subA)
      expect(msg(await redeem(s, c.code))).toBe('ok')
      const audits = await startedAudits(s.id)
      expect(audits).toHaveLength(1)
      expect(audits[0]?.metadata).toHaveProperty('sitting_id', null)
      expect(audits[0]?.metadata).toHaveProperty('sitting_entry_id', null)
    })
  })

  describe('guard order', () => {
    it('AC-ORDER: the gate runs before another_session_active on a scheduled sitting', async () => {
      const s = await student('ord-active')
      const first = await legacyCode(s.id, subB)
      expect(msg(await redeem(s, first.code))).toBe('ok')
      const w = await world(s, { day: 1, state: 'scheduled', subject: subA })
      expect(msg(await redeem(s, w.code))).toBe('sitting_not_open')
    })

    it('AC-ORDER: not_enrolled wins over the gate on a scheduled sitting', async () => {
      const s = await student('ord-enrol', { enrolled: false })
      const w = await world(s, { day: 1, state: 'scheduled' })
      expect(msg(await redeem(s, w.code))).toBe('not_enrolled')
    })
  })

  describe('I-LCK: lock order sitting then code', () => {
    it('AC-LCK: an owner redeem waits for a held sitting row lock; a non-owner does not', async () => {
      const owner = await student('lck-owner')
      const other = await student('lck-other')
      const w = await world(owner, { day: 0, state: 'open' })
      const held = holdLock(`SELECT 1 FROM exam_sittings WHERE id = '${w.sid}' FOR UPDATE`, 2)
      await sleep(600)
      const t0 = Date.now()
      const nonOwner = await redeem(other, w.code)
      const nonOwnerMs = Date.now() - t0
      expect(msg(nonOwner)).toBe('code_not_yours')
      expect(nonOwnerMs).toBeLessThan(1000)
      const t1 = Date.now()
      const r = await redeem(owner, w.code)
      const ownerMs = Date.now() - t1
      await held
      expect(msg(r)).toBe('ok')
      expect(ownerMs).toBeGreaterThanOrEqual(900)
    })

    it('AC-LCK: a held code row lock makes the redeem wait without deadlock', async () => {
      const owner = await student('lck-code')
      const w = await world(owner, { day: 0, state: 'open' })
      const held = holdLock(`SELECT 1 FROM internal_exam_codes WHERE id = '${w.id}' FOR UPDATE`, 2)
      await sleep(600)
      const t0 = Date.now()
      const r = await redeem(owner, w.code)
      await held
      expect(r.error?.code).not.toBe('40P01')
      expect(msg(r)).toBe('ok')
      expect(Date.now() - t0).toBeGreaterThanOrEqual(900)
    })
  })

  describe('I-RACE: no deadlock, outcome in the allowed set', () => {
    const noDeadlock = (...rs: Res[]) => {
      for (const r of rs) expect(r.error?.code, JSON.stringify(r.error)).not.toBe('40P01')
    }

    it('AC-RACE: redeem || Close ends started or code_voided, never consumed after close', async () => {
      const s = await student('race-close')
      for (let i = 0; i < RACE_N; i++) {
        const w = await world(s, { day: 0, state: 'open' })
        const [r, c] = await Promise.all([
          redeem(s, w.code),
          adminClient.rpc('close_exam_sitting', { p_sitting_id: w.sid }) as unknown as Promise<Res>,
        ])
        noDeadlock(r, c)
        expect(['ok', 'code_voided']).toContain(msg(r))
        expect(msg(c)).toBe('ok')
        expect((await codeRow(w.id)).consumed_at !== null).toBe(msg(r) === 'ok')
        await resetSessions(s.id)
      }
    })

    it('AC-RACE: redeem || cancel ends started with sitting_has_attempts, or code_voided with cancel ok', async () => {
      const s = await student('race-cancel')
      for (let i = 0; i < RACE_N; i++) {
        const w = await world(s, { day: 0, state: 'open' })
        const [r, c] = await Promise.all([
          redeem(s, w.code),
          adminClient.rpc('cancel_exam_sitting', {
            p_sitting_id: w.sid,
          }) as unknown as Promise<Res>,
        ])
        noDeadlock(r, c)
        if (msg(r) === 'ok') expect(msg(c)).toBe('sitting_has_attempts')
        else {
          expect(msg(r)).toBe('code_voided')
          expect(msg(c)).toBe('ok')
        }
        await resetSessions(s.id)
      }
    })

    it('AC-RACE: redeem || remove entry ends started with entry_has_attempt, or code_voided with remove ok', async () => {
      const s = await student('race-remove')
      for (let i = 0; i < RACE_N; i++) {
        const w = await world(s, { day: 0, state: 'open' })
        const [r, c] = await Promise.all([
          redeem(s, w.code),
          adminClient.rpc('remove_exam_sitting_entries', {
            p_sitting_id: w.sid,
            p_entry_ids: [w.eid],
          }) as unknown as Promise<Res>,
        ])
        noDeadlock(r, c)
        if (msg(r) === 'ok') expect(msg(c)).toBe('entry_has_attempt')
        else {
          expect(msg(r)).toBe('code_voided')
          expect(msg(c)).toBe('ok')
        }
        await resetSessions(s.id)
      }
    })

    it('AC-RACE: Start || redeem ends sitting_not_open or started, Start always ok', async () => {
      const s = await student('race-start')
      for (let i = 0; i < RACE_N; i++) {
        const w = await world(s, { day: 0, state: 'scheduled' })
        const [r, st] = await Promise.all([
          redeem(s, w.code),
          adminClient.rpc('start_exam_sitting', {
            p_sitting_id: w.sid,
          }) as unknown as Promise<Res>,
        ])
        noDeadlock(r, st)
        expect(['ok', 'sitting_not_open']).toContain(msg(r))
        expect(msg(st)).toBe('ok')
        await resetSessions(s.id)
      }
    })

    it('AC-1: redeem || finish-with-pass never starts a session while the same-subject pass lands', async () => {
      const s = await student('race-pass')
      for (let i = 0; i < RACE_N; i++) {
        const running = await seedRunningSession(s.id, subA)
        const w = await world(s, { day: 0, state: 'open' })
        const [r, f] = await Promise.all([
          redeem(s, w.code),
          admin
            .from('quiz_sessions')
            .update({ ended_at: new Date().toISOString(), passed: true })
            .eq('id', running)
            .select('id, passed') as unknown as Promise<Res>,
        ])
        noDeadlock(r, f)
        expect(['active_session_exists', 'already_passed']).toContain(msg(r))
        expect(msg(f)).toBe('ok')
        await resetSessions(s.id)
      }
    })

    it('AC-RACE: redeem || lazy close of a day-ended sitting never deadlocks', async () => {
      const s = await student('race-lazy')
      for (let i = 0; i < RACE_N; i++) {
        const w = await world(s, { day: -1, state: 'open' })
        const [r, l] = await Promise.all([
          redeem(s, w.code),
          adminClient.rpc('list_exam_sittings', { p_scope: 'past' }) as unknown as Promise<Res>,
        ])
        noDeadlock(r, l)
        expect(['sitting_not_open', 'code_voided', 'code_expired']).toContain(msg(r))
        expect(msg(l)).toBe('ok')
        expect((await codeRow(w.id)).consumed_at).toBeNull()
        await resetSessions(s.id)
      }
    })
  })
})

/** AC-PRIV is asserted in exam-sitting-private-execute.integration.test.ts (PRIVATE_FNS). */
describe('private sitting gate helpers privileges', () => {
  it.each(['sitting_redeem_gate', 'sitting_pass_gate'])(
    'AC-PRIV: %s exists, SECURITY INVOKER, search_path pinned, not executable by authenticated',
    (fn) => {
      const { out, err } = psql(
        `SELECT p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'private' AND p.proname = '${fn}';`,
      )
      expect(err).toBe('')
      expect(out).toMatch(/^false:search_path="?public"?, "?pg_temp"?:false$/)
    },
  )
})
