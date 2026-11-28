import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

const admin = getAdminClient()
const PW = 'test-pass-123'
const must = <T = Record<string, unknown>>(
  r: { data: unknown; error: { message: string } | null },
  label: string,
): T => {
  expect(r.error, label).toBeNull()
  return r.data as T
}

/** PR 2e: the legacy void RPC refuses a sitting code unless its attempt is running (sitting_code) and still voids legacy codes. */
describe('RPC: void_internal_exam_code refuses a sitting code unless its attempt is running', () => {
  const suffix = fixtureSuffix()
  let org = ''
  let adminId = ''
  let studentId = ''
  let subjectId = ''
  const userIds: string[] = []
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let a1c: Awaited<ReturnType<typeof getAuthenticatedClient>>
  let n = 0

  beforeAll(async () => {
    org = await createTestOrg({ admin, name: `vic ${suffix}`, slug: `vic-${suffix}` })
    const mk = async (t: string, role: 'admin' | 'student') => {
      const email = `vic-${t}-${suffix}@test.local`
      const id = await createTestUser({ admin, orgId: org, email, password: PW, role })
      userIds.push(id)
      return { id, email }
    }
    const a = await mk('a1', 'admin')
    adminId = a.id
    studentId = (await mk('s1', 'student')).id
    a1c = await getAuthenticatedClient({ email: a.email, password: PW })
    refs = await seedReferenceData({
      admin,
      subjectCode: `VI${suffix}`,
      subjectName: `Vic ${suffix}`,
      topicCode: `VI${suffix}-01`,
      topicName: `Vic Topic ${suffix}`,
    })
    subjectId = refs.subjectId
  }, 120_000)
  afterAll(async () => {
    await cleanupTestData({ admin, orgId: org, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  }, 120_000)

  async function insertCode(entryId: string | null): Promise<string> {
    return must<{ id: string }>(
      await admin
        .from('internal_exam_codes')
        .insert({
          code: `VI${suffix}${++n}`,
          subject_id: subjectId,
          student_id: studentId,
          issued_by: adminId,
          organization_id: org,
          sitting_entry_id: entryId,
          expires_at: new Date(Date.now() + 7_200_000).toISOString(),
        })
        .select('id')
        .single(),
      'code',
    ).id
  }
  async function sittingEntry(): Promise<string> {
    const day = new Date()
    day.setUTCHours(9, 0, 0, 0)
    const sit = must<{ id: string }>(
      await admin
        .from('exam_sittings')
        .insert({
          organization_id: org,
          scheduled_at: new Date(day.getTime() + 86_400_000).toISOString(),
          mode: 'remote',
          invigilator_id: adminId,
          created_by: adminId,
        })
        .select('id')
        .single(),
      'sitting',
    ).id
    must(
      await admin
        .from('exam_sitting_candidates')
        .insert({ organization_id: org, sitting_id: sit, user_id: studentId })
        .select('id')
        .single(),
      'candidate',
    )
    return must<{ id: string }>(
      await admin
        .from('exam_sitting_entries')
        .insert({
          organization_id: org,
          sitting_id: sit,
          user_id: studentId,
          subject_id: subjectId,
        })
        .select('id')
        .single(),
      'entry',
    ).id
  }
  const state = async (id: string) =>
    must<{ voided_at: string | null }>(
      await admin.from('internal_exam_codes').select('voided_at').eq('id', id).single(),
      'state',
    )
  const audits = async (id: string) =>
    must<unknown[]>(
      await admin
        .from('audit_events')
        .select('id')
        .eq('event_type', 'internal_exam.code_voided')
        .eq('resource_id', id),
      'audits',
    ).length

  it('rejects an unused sitting code with sitting_code and leaves it unvoided', async () => {
    const c = await insertCode(await sittingEntry())
    const r = await a1c.rpc('void_internal_exam_code', { p_code_id: c, p_reason: 'probe' })
    expect(r.error?.message).toBe('sitting_code')
    expect((await state(c)).voided_at).toBeNull()
    expect(await audits(c)).toBe(0)
  })

  async function runningSession(endedAt: string | null): Promise<string> {
    return must<{ id: string }>(
      await admin
        .from('quiz_sessions')
        .insert({
          organization_id: org,
          student_id: studentId,
          mode: 'internal_exam',
          subject_id: subjectId,
          config: { pass_mark: 75, question_ids: [] },
          total_questions: 0,
          started_at: new Date(Date.now() - 3_600_000).toISOString(),
          ended_at: endedAt,
        })
        .select('id')
        .single(),
      'session',
    ).id
  }
  async function consumeCode(sessionId: string): Promise<string> {
    const c = await insertCode(await sittingEntry())
    must(
      await admin
        .from('internal_exam_codes')
        .update({ consumed_at: new Date().toISOString(), consumed_session_id: sessionId })
        .eq('id', c)
        .select('id')
        .single(),
      'consume',
    )
    return c
  }
  const auditCount = async (type: string, resourceId: string) =>
    must<unknown[]>(
      await admin
        .from('audit_events')
        .select('id')
        .eq('event_type', type)
        .eq('resource_id', resourceId),
      'audit count',
    ).length

  it('voids a consumed sitting code whose attempt is running and ends the session', async () => {
    const sess = await runningSession(null)
    const c = await consumeCode(sess)
    const r = await a1c.rpc('void_internal_exam_code', { p_code_id: c, p_reason: 'running' })
    expect(r.error).toBeNull()
    expect((r.data as { session_ended: boolean }[])[0]?.session_ended).toBe(true)
    const s = must<{ ended_at: string | null }>(
      await admin.from('quiz_sessions').select('ended_at').eq('id', sess).single(),
      'session row',
    )
    expect(s.ended_at).not.toBeNull()
    expect((await state(c)).voided_at).not.toBeNull()
    expect(await auditCount('internal_exam.expired', sess)).toBe(1)
    expect(await audits(c)).toBe(1)
  })

  it('rejects a consumed sitting code with a finished attempt as cannot_void_finished_attempt', async () => {
    const sess = await runningSession(new Date().toISOString())
    const c = await consumeCode(sess)
    const r = await a1c.rpc('void_internal_exam_code', { p_code_id: c, p_reason: 'finished' })
    expect(r.error?.message).toBe('cannot_void_finished_attempt')
    expect((await state(c)).voided_at).toBeNull()
  })

  it('still voids a legacy code (no sitting entry) with one audit row', async () => {
    const c = await insertCode(null)
    const r = await a1c.rpc('void_internal_exam_code', { p_code_id: c, p_reason: 'legacy' })
    expect(r.error).toBeNull()
    expect((await state(c)).voided_at).not.toBeNull()
    expect(await audits(c)).toBe(1)
  })
})
