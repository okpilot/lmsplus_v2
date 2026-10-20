import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData, clearActiveSessions } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult } from './guards'
import { seedQuestions, seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

type StudyQuestion = {
  id: string
  question_text: string
  options: Array<{ id: string; text: string }>
  correct_option_id: string
  subject_code: string
  topic_name: string
  subtopic_name: string | null
  explanation_text: string | null
  difficulty: string
}
type DiscoveryResult = {
  session_id: string | null
  questions: StudyQuestion[]
  flagged_ids: string[]
}

// #1548 — start_discovery: draw + session row + audit + answer-key payload + flags in one
// round trip. SECURITY DEFINER bypasses RLS, so the org scope is an explicit join, tested here
// against a foreign-org question in the SAME subject.
describe('RPC: start_discovery (#1548)', () => {
  const admin = getAdminClient()
  const suffix = `${fixtureSuffix()}-sd`
  let orgId: string
  let otherOrgId: string
  let adminUserId: string
  let otherAdminId: string
  let studentId: string
  let peerId: string
  let inactiveId: string
  let studentClient: SupabaseClient
  let inactiveClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let refsBig: Awaited<ReturnType<typeof seedReferenceData>>
  let refsEmpty: Awaited<ReturnType<typeof seedReferenceData>>
  let questionIds: string[]
  let foreignIds: string[]
  const userIds: string[] = []
  const otherUserIds: string[] = []

  const start = async (
    client: SupabaseClient,
    over: Record<string, unknown> = {},
  ): Promise<{ data: unknown; error: { message: string; code?: string } | null }> =>
    await client.rpc('start_discovery', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: [],
      p_calc_mode: 'all',
      p_has_image: 'all',
      ...over,
    })

  const activeSessions = async (id: string = studentId) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, mode, subject_id, topic_id, config, total_questions')
      .eq('student_id', id)
      .is('deleted_at', null)
      .is('ended_at', null)
    if (error) throw new Error(`activeSessions: ${error.message}`)
    return data ?? []
  }

  const insertLiveSession = async (mode: string, id: string = studentId) => {
    const { error } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: id, mode, subject_id: refs.subjectId })
    if (error) throw new Error(`insertLiveSession(${mode}): ${error.message}`)
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `Test Org SD ${suffix}`, slug: `test-sd-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `Test Org SD Other ${suffix}`,
      slug: `test-sd-other-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-sd-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    otherAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `admin-sd-other-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    otherUserIds.push(otherAdminId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-sd-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    peerId = await createTestUser({
      admin,
      orgId,
      email: `peer-sd-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(peerId)
    inactiveId = await createTestUser({
      admin,
      orgId,
      email: `inactive-sd-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(inactiveId)
    studentClient = await getAuthenticatedClient({
      email: `student-sd-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    inactiveClient = await getAuthenticatedClient({
      email: `inactive-sd-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `SD${suffix}`,
      subjectName: `SD Subject ${suffix}`,
      topicCode: `SD${suffix}-01`,
      topicName: `SD Topic ${suffix}`,
      subtopicCode: `SD${suffix}-01-A`,
      subtopicName: `SD Subtopic ${suffix}`,
    })
    refsBig = await seedReferenceData({
      admin,
      subjectCode: `SDB${suffix}`,
      subjectName: `SD Big ${suffix}`,
      topicCode: `SDB${suffix}-01`,
      topicName: `SD Big Topic ${suffix}`,
    })
    refsEmpty = await seedReferenceData({
      admin,
      subjectCode: `SDE${suffix}`,
      subjectName: `SD Empty ${suffix}`,
      topicCode: `SDE${suffix}-01`,
      topicName: `SD Empty Topic ${suffix}`,
    })

    questionIds = (
      await seedQuestions({
        admin,
        orgId,
        createdBy: adminUserId,
        subjectId: refs.subjectId,
        topicId: refs.topicId,
        subtopicId: refs.subtopicId,
        count: 5,
      })
    ).questionIds
    foreignIds = (
      await seedQuestions({
        admin,
        orgId: otherOrgId,
        createdBy: otherAdminId,
        subjectId: refs.subjectId,
        topicId: refs.topicId,
        subtopicId: refs.subtopicId,
        count: 3,
      })
    ).questionIds
    await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refsBig.subjectId,
      topicId: refsBig.topicId,
      count: 510,
    })

    const { data: deactivated, error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', inactiveId)
      .select('id')
    if (error) throw new Error(`deactivate: ${error.message}`)
    if (!deactivated?.length) throw new Error('deactivate: zero rows affected')
  })

  afterAll(async () => {
    // Fixture teardown (same precedent as cleanup.ts): flagged_questions FK-blocks the
    // question/user deletes below and has no cascade.
    const { error: flagCleanupErr } = await admin
      .from('flagged_questions')
      .delete()
      .in('student_id', userIds)
    if (flagCleanupErr) console.error(`flagged_questions cleanup: ${flagCleanupErr.message}`)
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
    await cleanupReferenceData({ admin, refs: [refs, refsBig, refsEmpty] })
  })

  beforeEach(async () => {
    await clearActiveSessions({ admin, orgId })
    const { error } = await admin
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .in('student_id', [studentId, peerId])
      .is('deleted_at', null)
    if (error) throw new Error(`reset flags: ${error.message}`)
  })

  it('returns the questions with the answer key and the study columns', async () => {
    const { data, error } = await start(studentClient)
    expect(error).toBeNull()
    const result = requireRpcResult<DiscoveryResult>(data, 'start_discovery')
    expect(result.session_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.questions.map((q) => q.id).sort()).toEqual([...questionIds].sort())
    const q = result.questions[0] as StudyQuestion
    expect(q.correct_option_id).toBe('b')
    expect(q.options).toHaveLength(4)
    expect(Object.keys(q.options[0] ?? {}).sort()).toEqual(['id', 'text'])
    expect(q.subject_code).toBe(`SD${suffix}`)
    expect(q.topic_name).toBe(`SD Topic ${suffix}`)
    expect(q.subtopic_name).toBe(`SD Subtopic ${suffix}`)
    expect(q.explanation_text).toMatch(/^Explanation for question/)
    expect(q.difficulty).toBe('medium')
    expect(q.question_text).toMatch(/^Test question/)
  })

  it('persists a discovery session whose config ids equal the payload order', async () => {
    const result = requireRpcResult<DiscoveryResult>(
      (await start(studentClient)).data,
      'start_discovery',
    )
    const sessions = await activeSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe(result.session_id)
    expect(sessions[0]?.mode).toBe('discovery')
    expect(sessions[0]?.subject_id).toBe(refs.subjectId)
    expect(sessions[0]?.topic_id).toBeNull()
    expect(sessions[0]?.total_questions).toBe(5)
    const configIds = sessions[0]?.config.question_ids
    expect(configIds).toHaveLength(5)
    expect(result.questions.map((q) => q.id)).toEqual(configIds)
  })

  it('records the discovery.started audit event', async () => {
    const result = requireRpcResult<DiscoveryResult>(
      (await start(studentClient)).data,
      'start_discovery',
    )
    const { data: events, error } = await admin
      .from('audit_events')
      .select('event_type, resource_type, actor_id')
      .eq('resource_id', result.session_id)
    expect(error).toBeNull()
    expect(events).toHaveLength(1)
    expect(events?.[0]?.event_type).toBe('discovery.started')
    expect(events?.[0]?.resource_type).toBe('quiz_session')
    expect(events?.[0]?.actor_id).toBe(studentId)
  })

  it('never draws a question of another organisation', async () => {
    const { data: foreignRows, error: foreignErr } = await admin
      .from('questions')
      .select('id')
      .in('id', foreignIds)
      .eq('subject_id', refs.subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
    expect(foreignErr).toBeNull()
    expect(foreignRows).toHaveLength(foreignIds.length)

    const result = requireRpcResult<DiscoveryResult>(
      (await start(studentClient)).data,
      'start_discovery',
    )
    expect(result.questions.length).toBeGreaterThan(0)
    const drawn = result.questions.map((q) => q.id)
    for (const id of foreignIds) expect(drawn).not.toContain(id)
    const sessions = await activeSessions()
    for (const id of foreignIds) expect(sessions[0]?.config.question_ids).not.toContain(id)
  })

  it('returns flagged_ids as the caller active flags within the drawn set', async () => {
    const [flaggedActive, flaggedDeleted, flaggedByPeer] = questionIds as [string, string, string]
    const { error } = await admin.from('flagged_questions').insert([
      { student_id: studentId, question_id: flaggedActive },
      { student_id: studentId, question_id: flaggedDeleted, deleted_at: new Date().toISOString() },
      { student_id: peerId, question_id: flaggedByPeer },
    ])
    if (error) throw new Error(`flag: ${error.message}`)

    const result = requireRpcResult<DiscoveryResult>(
      (await start(studentClient)).data,
      'start_discovery',
    )
    expect(result.questions).toHaveLength(5)
    expect(result.flagged_ids).toEqual([flaggedActive])
  })

  it('applies the flagged filter to the draw', async () => {
    const flaggedId = questionIds[3] as string
    const { error } = await admin
      .from('flagged_questions')
      .upsert({ student_id: studentId, question_id: flaggedId, deleted_at: null })
    if (error) throw new Error(`flag: ${error.message}`)

    const result = requireRpcResult<DiscoveryResult>(
      (await start(studentClient, { p_filters: ['flagged'] })).data,
      'flagged filter',
    )
    expect(result.questions.map((q) => q.id)).toEqual([flaggedId])
    expect(result.flagged_ids).toEqual([flaggedId])
  })

  it('clamps the draw to the requested count, and to 500', async () => {
    const small = requireRpcResult<DiscoveryResult>(
      (await start(studentClient, { p_count: 2 })).data,
      'p_count=2',
    )
    expect(small.questions).toHaveLength(2)

    await clearActiveSessions({ admin, orgId })
    const big = requireRpcResult<DiscoveryResult>(
      (await start(studentClient, { p_subject_id: refsBig.subjectId, p_count: 10000 })).data,
      'p_count=10000',
    )
    expect(big.questions).toHaveLength(500)
    const sessions = await activeSessions()
    expect(sessions[0]?.total_questions).toBe(500)
  })

  it('draws nothing and creates no session for a NULL, zero or negative count', async () => {
    expect(questionIds.length).toBeGreaterThan(0)
    for (const p_count of [null, 0, -3]) {
      const { data, error } = await start(studentClient, { p_count })
      expect(error).toBeNull()
      const result = requireRpcResult<DiscoveryResult>(data, `p_count=${p_count}`)
      expect(result).toEqual({ session_id: null, questions: [], flagged_ids: [] })
    }
    expect(await activeSessions()).toHaveLength(0)
  })

  it('returns an empty result with no session or audit row when nothing matches', async () => {
    const countAudit = async () => {
      const { data, error } = await admin
        .from('audit_events')
        .select('id')
        .eq('actor_id', studentId)
        .eq('event_type', 'discovery.started')
      if (error) throw new Error(`countAudit: ${error.message}`)
      return data?.length ?? 0
    }
    const auditBefore = await countAudit()

    const { data, error } = await start(studentClient, { p_subject_id: refsEmpty.subjectId })
    expect(error).toBeNull()
    const result = requireRpcResult<DiscoveryResult>(data, 'empty subject')
    expect(result).toEqual({ session_id: null, questions: [], flagged_ids: [] })
    expect(await activeSessions()).toHaveLength(0)
    expect(await countAudit()).toBe(auditBefore)
  })

  it.each([['mock_exam'], ['quick_quiz']])(
    'raises another_session_active when a %s session is live',
    async (mode) => {
      await insertLiveSession(mode)
      const before = await activeSessions()
      expect(before).toHaveLength(1)

      const { data, error } = await start(studentClient)
      expect(error?.message).toContain('another_session_active')
      expect(data).toBeNull()
      const after = await activeSessions()
      expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id))
    },
  )

  it('replaces the caller own previous discovery session', async () => {
    const first = requireRpcResult<DiscoveryResult>(
      (await start(studentClient)).data,
      'first start',
    )
    const second = requireRpcResult<DiscoveryResult>(
      (await start(studentClient)).data,
      'second start',
    )
    expect(second.session_id).not.toBe(first.session_id)

    const active = await activeSessions()
    expect(active.map((s) => s.id)).toEqual([second.session_id])
    const { data: old, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at')
      .eq('id', first.session_id)
      .single()
    expect(error).toBeNull()
    expect(old?.deleted_at).not.toBeNull()
  })

  it('rejects a soft-deleted user', async () => {
    const { data: row } = await admin
      .from('users')
      .select('deleted_at')
      .eq('id', inactiveId)
      .single()
    expect(row?.deleted_at).not.toBeNull()

    const { data, error } = await start(inactiveClient)
    expect(error?.message).toContain('user_not_found_or_inactive')
    expect(data).toBeNull()
    expect(await activeSessions(inactiveId)).toHaveLength(0)
  })

  it('denies an anonymous caller', async () => {
    const { data, error } = await start(getAnonClient())
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })
})
