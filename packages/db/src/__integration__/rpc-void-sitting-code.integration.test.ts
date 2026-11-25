import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RESERVED_VOID_REASONS } from '../schema'
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

const at = (offset: number, hour = 9) => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() + offset * DAY + hour * 3_600_000).toISOString()
}
const must = <T = Record<string, unknown>>(
  r: { data: unknown; error: { message: string } | null },
  label: string,
): T => {
  expect(r.error, label).toBeNull()
  return r.data as T
}

/** void_sitting_code: sitting-scoped void that refuses used, voided and foreign codes. */
describe('RPC: void_sitting_code', () => {
  const suffix = fixtureSuffix()
  let orgA = ''
  let a1 = ''
  let s1 = ''
  let s2 = ''
  let subjectId = ''
  const userIds: string[] = []
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let a1c: Awaited<ReturnType<typeof getAuthenticatedClient>>
  let i1c: Awaited<ReturnType<typeof getAuthenticatedClient>>
  let n = 0

  beforeAll(async () => {
    orgA = await createTestOrg({ admin, name: `vsc ${suffix}`, slug: `vsc-${suffix}` })
    const mk = async (t: string, role: 'admin' | 'instructor' | 'student') => {
      const email = `vsc-${t}-${suffix}@test.local`
      const id = await createTestUser({
        admin,
        orgId: orgA,
        email,
        password: PW,
        role,
        fullName: `${t} ${suffix}`,
      })
      userIds.push(id)
      return { id, email }
    }
    const a = await mk('a1', 'admin')
    const i = await mk('i1', 'instructor')
    a1 = a.id
    s1 = (await mk('s1', 'student')).id
    s2 = (await mk('s2', 'student')).id
    a1c = await getAuthenticatedClient({ email: a.email, password: PW })
    i1c = await getAuthenticatedClient({ email: i.email, password: PW })
    refs = await seedReferenceData({
      admin,
      subjectCode: `VS${suffix}`,
      subjectName: `Vsc ${suffix}`,
      topicCode: `VS${suffix}-01`,
      topicName: `Vsc Topic ${suffix}`,
    })
    subjectId = refs.subjectId
  }, 120_000)
  afterAll(async () => {
    await cleanupTestData({ admin, orgId: orgA, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  }, 120_000)

  type State = 'scheduled' | 'open' | 'closed'
  async function sitting(state: State = 'open', day = 0): Promise<string> {
    const scheduled = at(day)
    const started = new Date(Math.min(Date.now() - 2000, new Date(scheduled).getTime()))
    const row: Record<string, unknown> = {
      organization_id: orgA,
      scheduled_at: scheduled,
      mode: 'remote',
      invigilator_id: a1,
      created_by: a1,
    }
    if (state !== 'scheduled') {
      row.started_at = started.toISOString()
      row.started_by = a1
    }
    if (state === 'closed') {
      row.closed_at = new Date(started.getTime() + 1000).toISOString()
      row.closed_by = a1
    }
    return must<{ id: string }>(
      await admin.from('exam_sittings').insert(row).select('id').single(),
      'sitting',
    ).id
  }
  async function entry(sittingId: string, userId: string): Promise<string> {
    must(
      await admin
        .from('exam_sitting_candidates')
        .insert({ organization_id: orgA, sitting_id: sittingId, user_id: userId })
        .select('id')
        .single(),
      'candidate',
    )
    return must<{ id: string }>(
      await admin
        .from('exam_sitting_entries')
        .insert({
          organization_id: orgA,
          sitting_id: sittingId,
          user_id: userId,
          subject_id: subjectId,
        })
        .select('id')
        .single(),
      'entry',
    ).id
  }
  async function session(userId: string): Promise<string> {
    return must<{ id: string }>(
      await admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgA,
          student_id: userId,
          mode: 'internal_exam',
          subject_id: subjectId,
          config: { pass_mark: 75, question_ids: [] },
          total_questions: 0,
          started_at: new Date(Date.now() - 3_600_000).toISOString(),
          ended_at: null,
        })
        .select('id')
        .single(),
      'session',
    ).id
  }
  async function code(
    entryId: string,
    userId: string,
    o: { voided?: boolean; consumedBy?: string } = {},
  ): Promise<string> {
    const row: Record<string, unknown> = {
      code: `VC${suffix}${++n}`,
      subject_id: subjectId,
      student_id: userId,
      issued_by: a1,
      organization_id: orgA,
      sitting_entry_id: entryId,
      expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    }
    if (o.voided) {
      row.voided_at = new Date().toISOString()
      row.voided_by = a1
      row.void_reason = 'manual'
    }
    if (o.consumedBy) {
      row.consumed_at = new Date().toISOString()
      row.consumed_session_id = o.consumedBy
    }
    return must<{ id: string }>(
      await admin.from('internal_exam_codes').insert(row).select('id').single(),
      'code',
    ).id
  }
  const codeRow = async (id: string) =>
    must<Record<string, unknown>>(
      await admin.from('internal_exam_codes').select('*').eq('id', id).single(),
      'code row',
    )
  const voidIt = (sit: string, c: string, reason = 'Wrong person', client = a1c) =>
    client.rpc('void_sitting_code', { p_sitting_id: sit, p_code_id: c, p_reason: reason })

  it('voids an unused code of the sitting and writes one internal_exam.code_voided audit row', async () => {
    const sit = await sitting()
    const c = await code(await entry(sit, s1), s1)
    const r = await voidIt(sit, c, '  Wrong person  ')
    expect(must<Array<{ code_id: string }>>(r, 'void')[0]?.code_id).toBe(c)
    expect(await codeRow(c)).toMatchObject({ voided_by: a1, void_reason: 'Wrong person' })
    expect((await codeRow(c)).voided_at).not.toBeNull()
    const audits = must<Array<{ actor_id: string; metadata: Record<string, unknown> }>>(
      await admin
        .from('audit_events')
        .select('actor_id, metadata')
        .eq('event_type', 'internal_exam.code_voided')
        .eq('resource_id', c),
      'audits',
    )
    expect(audits).toHaveLength(1)
    expect(audits[0]?.actor_id).toBe(a1)
  })

  it('refuses a consumed code with code_in_use and leaves the code and its session untouched', async () => {
    const sit = await sitting()
    const sess = await session(s1)
    const c = await code(await entry(sit, s1), s1, { consumedBy: sess })
    expect((await voidIt(sit, c)).error?.message).toBe('code_in_use')
    expect((await codeRow(c)).voided_at).toBeNull()
    const s = must<{ ended_at: string | null; deleted_at: string | null }>(
      await admin.from('quiz_sessions').select('ended_at, deleted_at').eq('id', sess).single(),
      'session row',
    )
    expect(s.ended_at).toBeNull()
    expect(s.deleted_at).toBeNull()
  })

  it('refuses a code that belongs to another sitting with code_not_found', async () => {
    const sit = await sitting()
    const other = await sitting('open')
    const c = await code(await entry(other, s2), s2)
    expect((await voidIt(sit, c)).error?.message).toBe('code_not_found')
    expect((await codeRow(c)).voided_at).toBeNull()
  })

  it('refuses an unknown code id with code_not_found', async () => {
    const sit = await sitting()
    expect((await voidIt(sit, '00000000-0000-4000-a000-0000000000ff')).error?.message).toBe(
      'code_not_found',
    )
  })

  it('refuses an already voided code with code_voided', async () => {
    const sit = await sitting()
    const c = await code(await entry(sit, s1), s1, { voided: true })
    expect((await voidIt(sit, c)).error?.message).toBe('code_voided')
  })

  it('refuses a closed sitting with sitting_closed and a day-ended one with sitting_day_ended', async () => {
    const closed = await sitting('closed')
    const c1 = await code(await entry(closed, s1), s1)
    expect((await voidIt(closed, c1)).error?.message).toBe('sitting_closed')
    const ended = await sitting('scheduled', -1)
    const c2 = await code(await entry(ended, s2), s2)
    expect((await voidIt(ended, c2)).error?.message).toBe('sitting_day_ended')
    expect((await codeRow(c1)).voided_at).toBeNull()
    expect((await codeRow(c2)).voided_at).toBeNull()
  })

  it('refuses a non-admin with not_admin and anon with 42501', async () => {
    const sit = await sitting()
    const c = await code(await entry(sit, s1), s1)
    expect((await voidIt(sit, c, 'x', i1c)).error?.message).toBe('not_admin')
    expect((await voidIt(sit, c, 'x', getAnonClient() as typeof a1c)).error?.code).toBe('42501')
    expect((await codeRow(c)).voided_at).toBeNull()
  })

  it.each(['', '   ', 'a'.repeat(501)])('refuses reason %j with invalid_input', async (reason) => {
    const sit = await sitting()
    const c = await code(await entry(sit, s1), s1)
    expect((await voidIt(sit, c, reason)).error?.message).toBe('invalid_input')
    expect((await codeRow(c)).voided_at).toBeNull()
  })

  // The column also carries these system tokens, and three readers key on 'sitting_cancelled'.
  it.each(RESERVED_VOID_REASONS)('refuses the system token %s', async (reason) => {
    const sit = await sitting()
    const c = await code(await entry(sit, s1), s1)
    expect((await voidIt(sit, c, reason)).error?.message).toBe('invalid_input')
    expect((await codeRow(c)).voided_at).toBeNull()
  })
})
