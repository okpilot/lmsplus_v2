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

/** AC-8..AC-16: create_exam_sitting / update_exam_sitting, plus the AC-9 guard matrix. */
describe('RPC: create_exam_sitting and update_exam_sitting', () => {
  let w: Awaited<ReturnType<typeof buildWorld>>
  beforeAll(async () => {
    w = await buildWorld('rpc-sit')
  })
  afterAll(async () => {
    await w?.teardown()
  })

  const create = (c: typeof admin, o: Record<string, unknown> = {}) =>
    c.rpc('create_exam_sitting', {
      p_scheduled_at: at(1),
      p_mode: 'remote',
      p_invigilator_id: w.i1,
      p_permitted_materials: 'calculator',
      ...o,
    })
  const update = (id: string, o: Record<string, unknown>, c: typeof admin = w.clients.a1) =>
    c.rpc('update_exam_sitting', { p_sitting_id: id, ...o })

  it('AC-8: create stores one scheduled row with no candidates or entries and audits it', async () => {
    const r = await create(w.clients.a1)
    const id = rowOf(must(r, 'create')).sitting_id as string
    const row = await w.sittingRow(id)
    expect(row).toMatchObject({
      status: 'scheduled',
      created_by: w.a1,
      mode: 'remote',
      invigilator_id: w.i1,
      permitted_materials: 'calculator',
      organization_id: w.orgA,
    })
    const cands = await admin.from('exam_sitting_candidates').select('id').eq('sitting_id', id)
    const entries = await admin.from('exam_sitting_entries').select('id').eq('sitting_id', id)
    expect(cands.data).toHaveLength(0)
    expect(entries.data).toHaveLength(0)
    const a = await w.audits('exam_sitting.created', id)
    expect(a).toHaveLength(1)
    expect(Object.keys(a[0]?.metadata ?? {}).sort()).toEqual(
      ['invigilator_id', 'mode', 'permitted_materials_set', 'scheduled_at'].sort(),
    )
    expect(a[0]?.metadata.permitted_materials_set).toBe(true)
    expect(a[0]?.actor_id).toBe(w.a1)
  })

  describe('AC-9: guard matrix on every new public RPC', () => {
    let sid: string
    let a2Client: typeof admin
    const matrix = (): Array<[string, Record<string, unknown>]> => [
      ['create_exam_sitting', { p_scheduled_at: at(1), p_mode: 'remote', p_invigilator_id: w.i1 }],
      ['update_exam_sitting', { p_sitting_id: sid, p_mode: 'in_person' }],
      ['start_exam_sitting', { p_sitting_id: sid }],
      ['close_exam_sitting', { p_sitting_id: sid }],
      ['cancel_exam_sitting', { p_sitting_id: sid }],
      ['add_exam_sitting_candidates', { p_sitting_id: sid, p_user_ids: [w.s1] }],
      ['remove_exam_sitting_candidates', { p_sitting_id: sid, p_user_ids: [w.s1] }],
      ['remove_exam_sitting_entries', { p_sitting_id: sid, p_entry_ids: [BAD] }],
      ['list_exam_sittings', { p_scope: 'upcoming' }],
      ['get_exam_sitting_summary', { p_sitting_id: sid }],
      ['get_pending_removal_notices', { p_sitting_id: sid }],
      ['list_exam_sitting_people', { p_sitting_id: sid }],
      ['get_exam_sitting_group_add_counts', { p_sitting_id: sid, p_group_id: BAD }],
      ['get_exam_sitting_same_day_people', { p_sitting_id: sid }],
      ['record_exam_sitting_notice', { p_sitting_id: sid, p_kind: 'changed', p_code_ids: [BAD] }],
    ]
    beforeAll(async () => {
      const email = `rpc-sit-a2-${suffix}@test.local`
      const a2 = await createTestUser({ admin, orgId: w.orgA, email, password: PW, role: 'admin' })
      w.userIds.push(a2)
      a2Client = await getAuthenticatedClient({ email, password: PW })
      await w.setUser(a2, { deleted_at: new Date().toISOString() })
    })

    const ensure = async () => {
      if (!sid) sid = await w.sitting()
    }

    it('anon gets 42501 on every RPC', async () => {
      await ensure()
      for (const [fn, args] of matrix()) {
        const r = await w.clients.anon.rpc(fn, args)
        expect(r.error?.code, fn).toBe('42501')
      }
    })

    it('a student and an instructor get not_admin on every RPC', async () => {
      await ensure()
      for (const [fn, args] of matrix()) {
        expect((await w.clients.s1.rpc(fn, args)).error?.message, `s1 ${fn}`).toBe('not_admin')
        expect((await w.clients.i1.rpc(fn, args)).error?.message, `i1 ${fn}`).toBe('not_admin')
      }
    })

    it('a soft-deleted admin gets not_admin on every RPC', async () => {
      await ensure()
      for (const [fn, args] of matrix()) {
        expect((await a2Client.rpc(fn, args)).error?.message, fn).toBe('not_admin')
      }
    })

    it('the service role (no uid) gets not_authenticated on every RPC', async () => {
      await ensure()
      for (const [fn, args] of matrix()) {
        expect((await admin.rpc(fn, args)).error?.message, fn).toBe('not_authenticated')
      }
    })
  })

  it('AC-10: invalid_input for a bad mode, NULL time, NULL invigilator and 1001-char materials', async () => {
    expectToken(await create(w.clients.a1, { p_mode: 'x' }), 'invalid_input')
    expectToken(await create(w.clients.a1, { p_scheduled_at: null }), 'invalid_input')
    expectToken(await create(w.clients.a1, { p_invigilator_id: null }), 'invalid_input')
    expectToken(
      await create(w.clients.a1, { p_permitted_materials: 'x'.repeat(1001) }),
      'invalid_input',
    )
  })

  it('AC-10: 1000-char materials are accepted and blank materials store NULL', async () => {
    must(await create(w.clients.a1, { p_permitted_materials: 'x'.repeat(1000) }), 'create 1000')
    const id = rowOf(
      must(await create(w.clients.a1, { p_permitted_materials: '  ' }), 'create blank'),
    ).sitting_id as string
    expect((await w.sittingRow(id)).permitted_materials).toBeNull()
  })

  it('AC-11: yesterday 23:59:59Z is scheduled_in_past; today 00:00:00Z is accepted', async () => {
    expectToken(
      await create(w.clients.a1, {
        p_scheduled_at: new Date(dayStart(0).getTime() - 1000).toISOString(),
      }),
      'scheduled_in_past',
    )
    must(
      await create(w.clients.a1, { p_scheduled_at: dayStart(0).toISOString() }),
      'create today 00:00',
    )
  })

  it('AC-11: update to yesterday is scheduled_in_past, to today 00:00 is accepted', async () => {
    const id = await w.sitting({ day: 2 })
    expectToken(
      await update(id, { p_scheduled_at: new Date(dayStart(0).getTime() - 1000).toISOString() }),
      'scheduled_in_past',
    )
    must(await update(id, { p_scheduled_at: dayStart(0).toISOString() }), 'update today 00:00')
  })

  it('AC-12: a student, deactivated instructor or org B admin as invigilator is invigilator_not_found', async () => {
    expectToken(await create(w.clients.a1, { p_invigilator_id: w.s1 }), 'invigilator_not_found')
    expectToken(await create(w.clients.a1, { p_invigilator_id: w.b1 }), 'invigilator_not_found')
    await w.setUser(w.i1, { deleted_at: new Date().toISOString() })
    expectToken(await create(w.clients.a1, { p_invigilator_id: w.i1 }), 'invigilator_not_found')
    await w.setUser(w.i1, { deleted_at: null })
  })

  it('AC-12: the admin themself and an instructor are accepted', async () => {
    must(await create(w.clients.a1, { p_invigilator_id: w.a1 }), 'self')
    must(await create(w.clients.a1, { p_invigilator_id: w.i1 }), 'instructor')
  })

  it('AC-13: identical values or all-NULL update is a no-op with no audit and no updated_at change', async () => {
    const id = await w.sitting({ day: 2, mode: 'remote', invigilator: w.i1, materials: 'same' })
    const before = await w.sittingRow(id)
    const same = rowOf(
      must(await update(id, { p_mode: 'remote', p_permitted_materials: 'same' }), 'same'),
    )
    expect(same).toMatchObject({ changed: false, codes_restamped: 0 })
    const nulls = rowOf(must(await update(id, {}), 'nulls'))
    expect(nulls).toMatchObject({ changed: false, codes_restamped: 0 })
    expect((await w.sittingRow(id)).updated_at).toBe(before.updated_at)
    expect(await w.audits('exam_sitting.updated', id)).toHaveLength(0)
  })

  it('AC-14: on an open sitting time, mode and materials changes are sitting_not_editable', async () => {
    const id = await w.sitting({ day: 0, state: 'open' })
    expectToken(await update(id, { p_scheduled_at: at(1) }), 'sitting_not_editable')
    expectToken(await update(id, { p_mode: 'in_person' }), 'sitting_not_editable')
    expectToken(await update(id, { p_permitted_materials: 'new' }), 'sitting_not_editable')
  })

  it('AC-14: an open sitting invigilator change works and audits invigilator_reassigned', async () => {
    const id = await w.sitting({ day: 0, state: 'open', invigilator: w.a1 })
    must(await update(id, { p_invigilator_id: w.i1 }), 'reassign')
    expect((await w.sittingRow(id)).invigilator_id).toBe(w.i1)
    const a = await w.audits('exam_sitting.invigilator_reassigned', id)
    expect(a).toHaveLength(1)
    expect(a[0]?.metadata).toMatchObject({ from: w.a1, to: w.i1 })
  })

  it('AC-14: a scheduled sitting with an invalid new invigilator is invigilator_not_found', async () => {
    const id = await w.sitting({ day: 2 })
    expectToken(await update(id, { p_invigilator_id: w.s1 }), 'invigilator_not_found')
  })

  it('AC-14: a time edit succeeds while the unchanged invigilator is deactivated', async () => {
    const id = await w.sitting({ day: 2, invigilator: w.i1 })
    await w.setUser(w.i1, { deleted_at: new Date().toISOString() })
    must(await update(id, { p_scheduled_at: at(3) }), 'edit with deactivated invigilator')
    await w.setUser(w.i1, { deleted_at: null })
  })

  it('AC-15: reschedule re-stamps only unused unvoided codes and notifies only the emailed one', async () => {
    const id = await w.sitting({ day: 2 })
    const e = []
    for (const u of [w.s1, w.s2, w.s3, w.s4]) e.push(await w.enter(id, u, w.subA))
    const session = await w.session(w.s4, w.subA)
    const unusedEmailed = await w.code(e[0] as string, { emailed: true })
    const unused = await w.code(e[1] as string)
    const voided = await w.code(e[2] as string, { voided: true })
    const consumed = await w.code(e[3] as string, { consumedBy: session })
    const before = { voided: await w.codeRow(voided), consumed: await w.codeRow(consumed) }

    const row = rowOf(must(await update(id, { p_scheduled_at: at(3) }), 'reschedule'))

    expect(row.codes_restamped).toBe(2)
    expect(row.notify_code_ids).toEqual([unusedEmailed])
    for (const c of [unusedEmailed, unused]) {
      expect(new Date((await w.codeRow(c)).expires_at as string).getTime()).toBe(dayEndMinus1us(3))
    }
    expect((await w.codeRow(voided)).expires_at).toBe(before.voided.expires_at)
    expect((await w.codeRow(consumed)).expires_at).toBe(before.consumed.expires_at)
    const a = await w.audits('exam_sitting.updated', id)
    expect(a).toHaveLength(1)
    expect(a[0]?.metadata).toMatchObject({
      scheduled_at: { old: expect.any(String), new: expect.any(String) },
      mode: { old: 'remote', new: 'remote' },
      permitted_materials_changed: false,
      codes_restamped: 2,
    })
  })

  it('AC-15: a materials-only change notifies nobody and re-stamps nothing; empty string clears materials', async () => {
    const id = await w.sitting({ day: 2, materials: 'old' })
    const entry = await w.enter(id, w.s1, w.subA)
    const code = await w.code(entry, { emailed: true })
    const before = (await w.codeRow(code)).expires_at
    const row = rowOf(must(await update(id, { p_permitted_materials: 'new' }), 'materials'))
    expect(row.notify_code_ids).toEqual([])
    expect(row.codes_restamped).toBe(0)
    expect((await w.codeRow(code)).expires_at).toBe(before)
    must(await update(id, { p_permitted_materials: '' }), 'clear')
    expect((await w.sittingRow(id)).permitted_materials).toBeNull()
  })

  it('AC-15: rescheduling to yesterday is scheduled_in_past', async () => {
    const id = await w.sitting({ day: 2 })
    expectToken(await update(id, { p_scheduled_at: at(-1) }), 'scheduled_in_past')
  })

  it('AC-16: closed is sitting_closed, cancelled and cross-org are sitting_not_found, day-ended scheduled is sitting_day_ended', async () => {
    expectToken(
      await update(await w.sitting({ day: 0, state: 'closed' }), { p_mode: 'in_person' }),
      'sitting_closed',
    )
    expectToken(
      await update(await w.sitting({ state: 'cancelled' }), { p_mode: 'in_person' }),
      'sitting_not_found',
    )
    expectToken(
      await update(await w.sitting({ day: -2 }), { p_mode: 'in_person' }),
      'sitting_day_ended',
    )
    expectToken(
      await update(await w.sitting({ org: w.orgB }), { p_mode: 'in_person' }),
      'sitting_not_found',
    )
  })

  it('AC-16: guard order: invalid_input beats sitting_closed; sitting_closed beats sitting_day_ended and specific tokens', async () => {
    const closed = await w.sitting({ day: -2, state: 'closed' })
    expectToken(await update(closed, { p_mode: 'x' }), 'invalid_input')
    expectToken(await update(closed, { p_mode: 'in_person' }), 'sitting_closed')
    expectToken(await update(closed, { p_invigilator_id: w.s1 }), 'sitting_closed')
    expectToken(await update(closed, { p_scheduled_at: at(-5) }), 'sitting_closed')
  })
})
