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

/** AC-17..AC-21: candidate add/remove and entry removal. */
describe('RPC: exam sitting candidates and entry removal', () => {
  let w: Awaited<ReturnType<typeof buildWorld>>
  beforeAll(async () => {
    w = await buildWorld('cand-sit')
  })
  afterEach(async () => {
    await w?.resetSessions()
  })
  afterAll(async () => {
    await w?.teardown()
  })
  const a1 = () => w.clients.a1
  const add = (id: string, users: string[], groups: string[] = []) =>
    a1().rpc('add_exam_sitting_candidates', {
      p_sitting_id: id,
      p_user_ids: users,
      p_group_ids: groups,
    })
  const rmCand = (id: string, users: string[]) =>
    a1().rpc('remove_exam_sitting_candidates', { p_sitting_id: id, p_user_ids: users })
  const rmEntries = (id: string, entries: string[]) =>
    a1().rpc('remove_exam_sitting_entries', { p_sitting_id: id, p_entry_ids: entries })
  const liveCands = async (id: string) =>
    must<{ user_id: string }[]>(
      await admin
        .from('exam_sitting_candidates')
        .select('user_id')
        .eq('sitting_id', id)
        .is('deleted_at', null),
      'live candidates',
    )

  it('AC-17: add [S1,S2] returns (2,0,0), re-adding returns (0,2,0), and audits the counts', async () => {
    const id = await w.sitting()
    expect(rowOf(must(await add(id, [w.s1, w.s2]), 'add'))).toMatchObject({
      added: 2,
      skipped_existing: 0,
      skipped_deactivated: 0,
    })
    expect(rowOf(must(await add(id, [w.s1, w.s2]), 're-add'))).toMatchObject({
      added: 0,
      skipped_existing: 2,
      skipped_deactivated: 0,
    })
    const a = await w.audits('exam_sitting.candidates_added', id)
    expect(a).toHaveLength(2)
    expect(Object.keys(a[0]?.metadata ?? {}).sort()).toEqual([
      'added',
      'group_ids',
      'skipped_deactivated',
      'skipped_existing',
    ])
  })

  it('AC-18: adding a group counts deactivated members apart, snapshots membership and counts a picked-plus-group user once', async () => {
    const id = await w.sitting()
    const g = await w.group('cg1', [w.s1, w.s2, w.s3])
    await w.setUser(w.s3, { deleted_at: new Date().toISOString() })
    expect(rowOf(must(await add(id, [], [g]), 'add group'))).toMatchObject({
      added: 2,
      skipped_existing: 0,
      skipped_deactivated: 1,
    })
    await w.setUser(w.s3, { deleted_at: null })
    must(
      await admin
        .from('student_group_members')
        .insert({ organization_id: w.orgA, group_id: g, user_id: w.s4 }),
      'g add s4',
    )
    must(
      await admin
        .from('student_groups')
        .update({ deleted_at: new Date().toISOString(), deleted_by: w.a1 })
        .eq('id', g),
      'g delete',
    )
    expect((await liveCands(id)).map((c) => c.user_id).sort()).toEqual([w.s1, w.s2].sort())

    const id2 = await w.sitting()
    const g2 = await w.group('cg2', [w.s1, w.s2])
    expect(rowOf(must(await add(id2, [w.s1], [g2]), 'picked + group')).added).toBe(2)
  })

  it('AC-19: bad users and groups raise student_not_found and group_not_found', async () => {
    const id = await w.sitting()
    await w.setUser(w.s3, { deleted_at: new Date().toISOString() })
    expectToken(await add(id, [w.s3]), 'student_not_found')
    await w.setUser(w.s3, { deleted_at: null })
    expectToken(await add(id, [w.i1]), 'student_not_found')
    expectToken(await add(id, [w.bs1]), 'student_not_found')
    const dead = await w.group('cdead', [w.s1])
    must(
      await admin
        .from('student_groups')
        .update({ deleted_at: new Date().toISOString(), deleted_by: w.a1 })
        .eq('id', dead),
      'g delete',
    )
    expectToken(await add(id, [], [dead]), 'group_not_found')
    expectToken(await add(id, [], [await w.group('cb', [w.bs1], w.orgB)]), 'group_not_found')
  })

  it('AC-19: invalid_input for both arrays empty, 501 users and 51 groups', async () => {
    const id = await w.sitting()
    const ids = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `00000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`,
      )
    expectToken(await add(id, [], []), 'invalid_input')
    expectToken(await add(id, ids(501)), 'invalid_input')
    expectToken(await add(id, [], ids(51)), 'invalid_input')
  })

  it('AC-19: 500 live candidates plus one more is too_many_candidates and adds nothing', async () => {
    const id = await w.sitting()
    const seeded = Array.from({ length: 500 }, () => crypto.randomUUID())
    try {
      await bulkStudents(w.orgA, seeded)
      must(
        await admin
          .from('exam_sitting_candidates')
          .insert(seeded.map((user_id) => ({ organization_id: w.orgA, sitting_id: id, user_id }))),
        'bulk candidates',
      )
      expectToken(await add(id, [w.s1]), 'too_many_candidates')
      expect(await liveCands(id)).toHaveLength(500)
    } finally {
      const errors: string[] = []
      const del = await admin.from('exam_sitting_candidates').delete().eq('sitting_id', id)
      if (del.error) errors.push(`candidates: ${del.error.message}`)
      const cleanup = psql(
        `DELETE FROM public.users WHERE id = ANY('{${seeded.join(',')}}'::uuid[]); DELETE FROM auth.users WHERE id = ANY('{${seeded.join(',')}}'::uuid[]);`,
      )
      if (cleanup.err) errors.push(`users: ${cleanup.err}`)
      expect(errors, 'bulk cleanup').toEqual([])
    }
  })

  it('AC-19: closed is sitting_closed, day-ended is sitting_day_ended, an open sitting accepts adds', async () => {
    expectToken(await add(await w.sitting({ day: 0, state: 'closed' }), [w.s1]), 'sitting_closed')
    expectToken(await add(await w.sitting({ day: -2 }), [w.s1]), 'sitting_day_ended')
    must(await add(await w.sitting({ day: 0, state: 'open' }), [w.s1]), 'add to open')
  })

  it('AC-20: removing S1 with 2 entries and 2 unused codes returns (1,2,2) and voids as entry_removed', async () => {
    const id = await w.sitting()
    const e1 = await w.enter(id, w.s1, w.subA)
    const e2 = await w.entry(id, w.s1, w.subB)
    const c1 = await w.code(e1)
    const c2 = await w.code(e2)

    expect(rowOf(must(await rmCand(id, [w.s1]), 'remove'))).toMatchObject({
      removed: 1,
      entries_removed: 2,
      codes_voided: 2,
    })

    expect((await liveCands(id)).map((c) => c.user_id)).not.toContain(w.s1)
    const entries = await admin
      .from('exam_sitting_entries')
      .select('id, deleted_at')
      .eq('sitting_id', id)
    expect(entries.error).toBeNull()
    expect((entries.data ?? []).map((r) => r.id).sort()).toEqual([e1, e2].sort())
    expect(entries.data?.every((r) => r.deleted_at !== null)).toBe(true)
    for (const c of [c1, c2]) expect((await w.codeRow(c)).void_reason).toBe('entry_removed')
    const voids = (await w.audits('internal_exam.code_voided')).filter(
      (a) => a.metadata.sitting_id === id,
    )
    expect(voids).toHaveLength(2)
    expect((await w.audits('exam_sitting.candidates_removed', id))[0]?.metadata).toMatchObject({
      removed: 1,
      entries_removed: 2,
      codes_voided: 2,
    })
    must(await add(id, [w.s1]), 're-add')
    expect(await liveCands(id)).toHaveLength(1)
    const all = await admin.from('exam_sitting_candidates').select('id').eq('sitting_id', id)
    expect(all.data).toHaveLength(2)
  })

  it('AC-20: a non-candidate in the list is candidate_not_found and removes nothing for the others', async () => {
    const id = await w.sitting()
    await w.candidate(id, w.s1)
    expectToken(await rmCand(id, [w.s1, w.s2]), 'candidate_not_found')
    expect(await liveCands(id)).toHaveLength(1)
  })

  it('AC-20: a candidate with a consumed code, also consumed-then-voided, is candidate_has_attempt', async () => {
    for (const voided of [false, true]) {
      const id = await w.sitting({ day: 0, state: 'open' })
      const entry = await w.enter(id, w.s1, w.subA)
      await w.code(entry, { consumedBy: await w.session(w.s1, w.subA, { ended: false }), voided })
      expectToken(await rmCand(id, [w.s1]), 'candidate_has_attempt')
      await w.resetSessions()
    }
  })

  it('AC-20: after either removal path no live entry lacks a live candidate', async () => {
    const id = await w.sitting()
    await w.enter(id, w.s1, w.subA)
    await w.enter(id, w.s2, w.subA)
    const e3 = await w.enter(id, w.s3, w.subA)
    must(await rmCand(id, [w.s1]), 'rm candidate')
    must(await rmEntries(id, [e3]), 'rm entry')
    const { out } = psql(
      `SELECT count(*) FROM exam_sitting_entries e WHERE e.sitting_id = '${id}' AND e.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM exam_sitting_candidates c WHERE c.sitting_id = e.sitting_id AND c.user_id = e.user_id AND c.deleted_at IS NULL AND e.user_id <> '${w.s3}');`,
    )
    expect(out).toBe('0')
  })

  it('AC-21: remove_exam_sitting_entries rejects unknown, foreign and already-removed ids all-or-nothing', async () => {
    const id = await w.sitting()
    const e1 = await w.enter(id, w.s1, w.subA)
    const foreignSit = await w.sitting({ org: w.orgB })
    await w.candidate(foreignSit, w.bs1, w.orgB)
    const foreign = await w.entry(foreignSit, w.bs1, w.subA, w.orgB)
    expectToken(await rmEntries(id, [e1, BAD]), 'entry_not_found')
    expectToken(await rmEntries(id, [e1, foreign]), 'entry_not_found')
    expect(
      (await admin.from('exam_sitting_entries').select('deleted_at').eq('id', e1).single()).data
        ?.deleted_at,
    ).toBeNull()
    must(await rmEntries(id, [e1]), 'remove')
    expectToken(await rmEntries(id, [e1]), 'entry_not_found')
  })

  it('AC-21: removal returns counts, voids as entry_removed, keeps the candidate and audits', async () => {
    const id = await w.sitting()
    const e1 = await w.enter(id, w.s1, w.subA)
    const code = await w.code(e1)
    expect(rowOf(must(await rmEntries(id, [e1]), 'remove'))).toMatchObject({
      removed: 1,
      codes_voided: 1,
    })
    expect((await w.codeRow(code)).void_reason).toBe('entry_removed')
    expect(await liveCands(id)).toHaveLength(1)
    expect((await w.audits('exam_sitting.entries_removed', id))[0]?.metadata).toMatchObject({
      entry_ids: [e1],
      removed: 1,
      codes_voided: 1,
    })
  })

  it('AC-21: an entry with a consumed code is entry_has_attempt; empty and 2001 ids are invalid_input; closed is sitting_closed', async () => {
    const id = await w.sitting({ day: 0, state: 'open' })
    const e = await w.enter(id, w.s1, w.subA)
    await w.code(e, { consumedBy: await w.session(w.s1, w.subA, { ended: false }) })
    expectToken(await rmEntries(id, [e]), 'entry_has_attempt')
    expectToken(await rmEntries(id, []), 'invalid_input')
    const many = Array.from(
      { length: 2001 },
      (_, i) => `00000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`,
    )
    expectToken(await rmEntries(id, many), 'invalid_input')
    expectToken(
      await rmEntries(await w.sitting({ day: 0, state: 'closed' }), [e]),
      'sitting_closed',
    )
  })

  async function bulkStudents(org: string, ids: string[]): Promise<void> {
    // public.users.id references auth.users, so create auth rows through SQL then public rows.
    const values = ids.map((id, i) => `('${id}', 'bulk${i}-${suffix}@test.local')`).join(',')
    const r = psql(
      `INSERT INTO auth.users (id, instance_id, aud, role, email) SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email FROM (VALUES ${values}) AS v(id, email);
       INSERT INTO public.users (id, organization_id, email, full_name, role) SELECT v.id::uuid, '${org}', v.email, 'bulk', 'student' FROM (VALUES ${values}) AS v(id, email);`,
    )
    expect(r.err).toBe('')
  }
})
