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

/** AC-37..AC-39: config-disable block and syllabus dependency. */
describe('exam config sitting block and syllabus guards', () => {
  let w: Awaited<ReturnType<typeof buildWorld>>
  beforeAll(async () => {
    w = await buildWorld('blk-sit')
  })
  afterAll(async () => {
    await w?.teardown()
  })
  const disable = (subject: string) =>
    w.clients.a1
      .from('exam_configs')
      .update({ enabled: false })
      .eq('organization_id', w.orgA)
      .eq('subject_id', subject)
  const enable = (subject: string) =>
    admin
      .from('exam_configs')
      .update({ enabled: true })
      .eq('organization_id', w.orgA)
      .eq('subject_id', subject)
  const upsertDisabled = (subject: string) =>
    w.clients.a1.rpc('upsert_exam_config', {
      p_subject_id: subject,
      p_enabled: false,
      p_total_questions: 10,
      p_time_limit_seconds: 1800,
      p_pass_mark: 75,
      p_distributions: [],
    })
  const softDeleteConfig = (subject: string) =>
    admin
      .from('exam_configs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', w.orgA)
      .eq('subject_id', subject)

  async function liveEntry(state: 'scheduled' | 'open', subject = w.subA) {
    const sit = await w.sitting({ day: 0, state })
    const entry = await w.enter(sit, w.s1, subject)
    return { sit, entry }
  }

  it.each(['scheduled', 'open'] as const)(
    'AC-37: with a live entry in a %s sitting, disable via RLS UPDATE raises exam_config_in_use',
    async (state) => {
      const { sit } = await liveEntry(state)
      expect((await disable(w.subA)).error?.message).toBe('exam_config_in_use')
      await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit })
    },
  )

  it('AC-37: upsert_exam_config(p_enabled=false) and a service-role soft delete raise exam_config_in_use', async () => {
    const { sit } = await liveEntry('scheduled')
    expect((await upsertDisabled(w.subA)).error?.message).toBe('exam_config_in_use')
    expect((await softDeleteConfig(w.subA)).error?.message).toContain('exam_config_in_use')
    await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit })
  })

  it('AC-38: disable is allowed once the sitting is closed or cancelled, or the sitting day ended', async () => {
    for (const state of ['closed', 'cancelled'] as const) {
      const sit = await w.sitting({ day: 0, state })
      await w.enter(sit, w.s1, w.subA)
      must(await disable(w.subA).select('id'), `disable with ${state} sitting`)
      must(await enable(w.subA).select('id'), 're-enable')
    }
    const stale = await w.sitting({ day: -2 })
    await w.enter(stale, w.s2, w.subA)
    must(await disable(w.subA).select('id'), 'disable with day-ended sitting')
    must(await enable(w.subA).select('id'), 're-enable')
  })

  it('AC-38: disable is allowed after the entry is soft-deleted, for another subject, and for an org B entry', async () => {
    const { sit, entry } = await liveEntry('scheduled')
    must(await disable(w.subB).select('id'), 'other subject')
    must(await enable(w.subB).select('id'), 're-enable B')
    const bSit = await w.sitting({ org: w.orgB, day: 0 })
    await w.candidate(bSit, w.bs1, w.orgB)
    await w.entry(bSit, w.bs1, w.subB, w.orgB)
    must(await disable(w.subB).select('id'), 'org B entry only')
    must(await enable(w.subB).select('id'), 're-enable B')
    must(
      await admin
        .from('exam_sitting_entries')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', entry),
      'soft delete entry',
    )
    must(await disable(w.subA).select('id'), 'entry removed')
    must(await enable(w.subA).select('id'), 're-enable A')
    await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit })
  })

  it('AC-38: re-enable and editing params while enabled are not blocked', async () => {
    const { sit } = await liveEntry('scheduled')
    must(await enable(w.subA).select('id'), 're-enable while enabled')
    must(
      await w.clients.a1.rpc('upsert_exam_config', {
        p_subject_id: w.subA,
        p_enabled: true,
        p_total_questions: 10,
        p_time_limit_seconds: 1900,
        p_pass_mark: 75,
        p_distributions: [],
      }),
      'edit params',
    )
    await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit })
  })

  it('AC-39: soft_delete_syllabus_item is in_use for a subject with a live config and entry, and the config delete is refused', async () => {
    const { sit } = await liveEntry('scheduled')
    const r = await w.clients.a1.rpc('soft_delete_syllabus_item', {
      p_table: 'easa_subjects',
      p_id: w.subA,
    })
    expect(r.error?.message).toContain('in_use')
    expect((await softDeleteConfig(w.subA)).error?.message).toContain('exam_config_in_use')
    await w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: sit })
  })

  it('AC-39: an entry for a soft-deleted subject cannot be inserted or moved to one', async () => {
    const dead = await seedReferenceData({
      admin,
      subjectCode: `SD${suffix}`,
      subjectName: `Sit Dead ${suffix}`,
      topicCode: `SD${suffix}-01`,
      topicName: `Sit Dead Topic ${suffix}`,
    })
    try {
      must(
        await admin
          .from('easa_subjects')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', dead.subjectId),
        'soft delete subject',
      )
      const sit = await w.sitting({ day: 1 })
      await w.candidate(sit, w.s1)
      const ins = await admin.from('exam_sitting_entries').insert({
        organization_id: w.orgA,
        sitting_id: sit,
        user_id: w.s1,
        subject_id: dead.subjectId,
      })
      expect(ins.error).not.toBeNull()
      const live = await w.entry(sit, w.s1, w.subB)
      const mv = await admin
        .from('exam_sitting_entries')
        .update({ subject_id: dead.subjectId })
        .eq('id', live)
      expect(mv.error).not.toBeNull()
    } finally {
      await cleanupReferenceData({ admin, refs: [dead] })
    }
  })
})
