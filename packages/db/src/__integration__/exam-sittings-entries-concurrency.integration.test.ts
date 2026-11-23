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

/** AC-53..AC-59, AC-26: two-connection races, outcome-set assertions. */
describe('sitting entries and issue concurrency', () => {
  let w: World
  beforeAll(async () => {
    w = await buildWorld('race-sit')
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

  const add = (sit: string, users: string[], subjects: string[]) =>
    w.clients.a1.rpc('add_exam_sitting_entries', {
      p_sitting_id: sit,
      p_user_ids: users,
      p_subject_ids: subjects,
    })
  const issue = (sit: string) => w.clients.a1.rpc('issue_sitting_exam_codes', { p_sitting_id: sit })
  const liveEntries = async (user: string, subject: string) =>
    must<Array<{ id: string; sitting_id: string }>>(
      await admin
        .from('exam_sitting_entries')
        .select('id, sitting_id')
        .eq('organization_id', w.orgA)
        .eq('user_id', user)
        .eq('subject_id', subject)
        .is('deleted_at', null),
      'live entries',
    )
  const liveCodeCount = async (entry: string) => {
    const r = await admin
      .from('internal_exam_codes')
      .select('id', { count: 'exact', head: true })
      .eq('sitting_entry_id', entry)
      .is('voided_at', null)
    expect(r.error).toBeNull()
    return r.count ?? 0
  }

  it('AC-53: the same pair added to two sittings at once yields one entry and one skipped_entered_elsewhere', async () => {
    for (const u of [w.s1, w.s2, w.s4]) {
      const x = await w.sitting({ day: 1 })
      const y = await w.sitting({ day: 2 })
      await w.candidate(x, u)
      await w.candidate(y, u)
      const [a, b] = await Promise.all([add(x, [u], [w.subA]), add(y, [u], [w.subA])])
      const ra = rowOf(must(a, 'a'))
      const rb = rowOf(must(b, 'b'))
      expect([ra.added, rb.added].sort()).toEqual([0, 1])
      expect(Number(ra.skipped_entered_elsewhere) + Number(rb.skipped_entered_elsewhere)).toBe(1)
      expect(await liveEntries(u, w.subA)).toHaveLength(1)
    }
  })

  it('AC-54: opposite-order pair sets across two sittings both complete without a deadlock', async () => {
    const x = await w.sitting({ day: 1 })
    const y = await w.sitting({ day: 2 })
    for (const u of [w.s1, w.s2]) {
      await w.candidate(x, u)
      await w.candidate(y, u)
    }
    const [a, b] = await Promise.all([
      add(x, [w.s1, w.s2, w.s1, w.s2], [w.subA, w.subA, w.subB, w.subB]),
      add(y, [w.s2, w.s1, w.s2, w.s1], [w.subB, w.subB, w.subA, w.subA]),
    ])
    must(a, 'a')
    must(b, 'b')
    for (const u of [w.s1, w.s2]) {
      for (const s of [w.subA, w.subB]) expect(await liveEntries(u, s)).toHaveLength(1)
    }
  })

  it('AC-55 / AC-26: a pass finishing during add is skipped_passed, or the entry is created and pruned by the next issue, never issued a code', async () => {
    for (const u of [w.s1, w.s2, w.s4]) {
      const x = await w.sitting({ day: 1 })
      await w.candidate(x, u)
      const [a] = await Promise.all([add(x, [u], [w.subA]), scored(w, u, w.subA, true)])
      const ra = rowOf(must(a, 'add'))
      const entries = await liveEntries(u, w.subA)
      if (ra.skipped_passed === 1) {
        expect(entries).toHaveLength(0)
      } else {
        expect(ra.added).toBe(1)
        must(await issue(x), 'issue')
        expect(await liveEntries(u, w.subA)).toHaveLength(0)
        for (const e of entries) expect(await liveCodeCount(e.id)).toBe(0)
      }
    }
  })

  it('AC-56: add and remove candidate for the same user leave no live entry without a live candidate', async () => {
    for (let i = 0; i < 3; i++) {
      const x = await w.sitting({ day: 1 })
      await w.candidate(x, w.s1)
      const [a, r] = await Promise.all([
        add(x, [w.s1], [w.subA]),
        w.clients.a1.rpc('remove_exam_sitting_candidates', { p_sitting_id: x, p_user_ids: [w.s1] }),
      ])
      must(a, 'add')
      must(r, 'remove')
      const live = await countOf('exam_sitting_entries', w.orgA, x)
      const cands = await countOf('exam_sitting_candidates', w.orgA, x)
      if (live > 0) expect(cands).toBeGreaterThan(0)
    }
  })

  it('AC-57: config disable and add: exactly one wins', async () => {
    const x = await w.sitting({ day: 1 })
    await w.candidate(x, w.s1)
    const [a, d] = await Promise.all([
      add(x, [w.s1], [w.subA]),
      admin
        .from('exam_configs')
        .update({ enabled: false })
        .eq('organization_id', w.orgA)
        .eq('subject_id', w.subA)
        .select('id'),
    ])
    const addOk = a.error === null && rowOf(a.data).added === 1
    const disableOk = d.error === null
    expect(addOk !== disableOk).toBe(true)
    if (addOk) expect(d.error?.message).toMatch(/exam_config_in_use/)
    else expect(a.error?.message).toBe('exam_config_required')
  })

  it('AC-58: issue and issue yield one live code per entry and the loser reports skipped_already_issued', async () => {
    const x = await w.sitting({ day: 1 })
    const entries = [await w.enter(x, w.s1, w.subA), await w.enter(x, w.s2, w.subA)]
    const [a, b] = await Promise.all([issue(x), issue(x)])
    const ra = rowOf(must(a, 'a'))
    const rb = rowOf(must(b, 'b'))
    expect(Number(ra.issued) + Number(rb.issued)).toBe(2)
    expect(Number(ra.skipped_already_issued) + Number(rb.skipped_already_issued)).toBe(2 * 2 - 2)
    for (const e of entries) expect(await liveCodeCount(e)).toBe(1)
  })

  it('AC-58: issue and remove entry serialise: the code is voided entry_removed or the issue never saw the entry', async () => {
    const x = await w.sitting({ day: 1 })
    const e = await w.enter(x, w.s1, w.subA)
    const [i] = await Promise.all([
      issue(x),
      w.clients.a1.rpc('remove_exam_sitting_entries', { p_sitting_id: x, p_entry_ids: [e] }),
    ])
    if (i.error) expect(i.error.message).toBe('entry_not_found')
    else expect(i.data).toBeDefined()
    expect(i.error?.code).not.toBe('PGRST202')
    expect(await liveCodeCount(e)).toBe(0)
    const codes = must<Array<{ void_reason: string | null }>>(
      await admin.from('internal_exam_codes').select('void_reason').eq('sitting_entry_id', e),
      'codes',
    )
    for (const c of codes) expect(c.void_reason).toBe('entry_removed')
  })

  it('AC-58: issue and close leave no live code on a closed sitting', async () => {
    const x = await w.sitting({ day: 0, state: 'open' })
    const e = await w.enter(x, w.s1, w.subA)
    const [i] = await Promise.all([
      issue(x),
      w.clients.a1.rpc('close_exam_sitting', { p_sitting_id: x }),
    ])
    if (i.error) expect(i.error.message).toBe('sitting_closed')
    expect((await w.sittingRow(x)).status).toBe('closed')
    expect(await liveCodeCount(e)).toBe(0)
  })

  it('AC-58: issue and cancel: the issue is sitting_not_found or its codes are voided', async () => {
    const x = await w.sitting({ day: 1 })
    const e = await w.enter(x, w.s1, w.subA)
    const [i] = await Promise.all([
      issue(x),
      w.clients.a1.rpc('cancel_exam_sitting', { p_sitting_id: x }),
    ])
    if (i.error) expect(i.error.message).toBe('sitting_not_found')
    expect(await liveCodeCount(e)).toBe(0)
  })

  it('AC-59: eligibility and add run side by side without failure; the add result is authoritative', async () => {
    const x = await w.sitting({ day: 1 })
    await w.candidate(x, w.s1)
    const [el, ad] = await Promise.all([
      w.clients.a1.rpc('get_exam_sitting_subject_eligibility', { p_sitting_id: x }),
      add(x, [w.s1, w.s1], [w.subA, w.subB]),
    ])
    must(el, 'eligibility')
    const r = rowOf(must(ad, 'add'))
    expect(await countOf('exam_sitting_entries', w.orgA, x)).toBe(r.added)
  })
})
