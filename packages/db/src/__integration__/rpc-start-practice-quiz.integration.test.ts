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

type StartResult = { session_id: string | null; question_ids: string[] }

// #1548 — start_practice_quiz: draw + start_quiz_session in one round trip.
// Runs against the real local Postgres: a plpgsql body is only validated at execution.
describe('RPC: start_practice_quiz (#1548)', () => {
  const admin = getAdminClient()
  const suffix = `${fixtureSuffix()}-spq`
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let inactiveClient: SupabaseClient
  let inactiveId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let refsTwo: Awaited<ReturnType<typeof seedReferenceData>>
  let refsBig: Awaited<ReturnType<typeof seedReferenceData>>
  let refsEmpty: Awaited<ReturnType<typeof seedReferenceData>>
  let questionIds: string[]
  let topicTwoQuestionIds: string[]
  const userIds: string[] = []

  const start = async (
    client: SupabaseClient,
    over: Record<string, unknown> = {},
  ): Promise<{ data: unknown; error: { message: string; code?: string } | null }> =>
    await client.rpc('start_practice_quiz', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 3,
      p_filters: [],
      p_calc_mode: 'all',
      p_has_image: 'all',
      ...over,
    })

  const sessionRows = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('mode, subject_id, topic_id, config, total_questions, student_id')
      .eq('id', id)
    if (error) throw new Error(`sessionRows: ${error.message}`)
    return data ?? []
  }

  const countSessions = async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .is('deleted_at', null)
    if (error) throw new Error(`countSessions: ${error.message}`)
    return data?.length ?? 0
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org SPQ ${suffix}`,
      slug: `test-spq-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-spq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-spq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    inactiveId = await createTestUser({
      admin,
      orgId,
      email: `inactive-spq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(inactiveId)
    studentClient = await getAuthenticatedClient({
      email: `student-spq-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    inactiveClient = await getAuthenticatedClient({
      email: `inactive-spq-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `SPQ${suffix}`,
      subjectName: `SPQ Subject ${suffix}`,
      topicCode: `SPQ${suffix}-01`,
      topicName: `SPQ Topic ${suffix}`,
    })
    refsTwo = await seedReferenceData({
      admin,
      subjectCode: `SPQ${suffix}`,
      subjectName: `SPQ Subject ${suffix}`,
      topicCode: `SPQ${suffix}-02`,
      topicName: `SPQ Topic Two ${suffix}`,
      subtopicCode: `SPQ${suffix}-02-A`,
      subtopicName: `SPQ Subtopic Two ${suffix}`,
    })
    expect(refsTwo.subjectId).toBe(refs.subjectId)
    refsBig = await seedReferenceData({
      admin,
      subjectCode: `SPQB${suffix}`,
      subjectName: `SPQ Big ${suffix}`,
      topicCode: `SPQB${suffix}-01`,
      topicName: `SPQ Big Topic ${suffix}`,
    })
    refsEmpty = await seedReferenceData({
      admin,
      subjectCode: `SPQE${suffix}`,
      subjectName: `SPQ Empty ${suffix}`,
      topicCode: `SPQE${suffix}-01`,
      topicName: `SPQ Empty Topic ${suffix}`,
    })

    questionIds = (
      await seedQuestions({
        admin,
        orgId,
        createdBy: adminUserId,
        subjectId: refs.subjectId,
        topicId: refs.topicId,
        count: 5,
      })
    ).questionIds
    topicTwoQuestionIds = (
      await seedQuestions({
        admin,
        orgId,
        createdBy: adminUserId,
        subjectId: refs.subjectId,
        topicId: refsTwo.topicId,
        subtopicId: refsTwo.subtopicId,
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
    // Fixture teardown (precedent: rls-active-user-writes.integration.test.ts): flagged_questions
    // FK-blocks the question/user deletes below and has no cascade.
    const { error: flagCleanupErr } = await admin
      .from('flagged_questions')
      .delete()
      .in('student_id', userIds)
    if (flagCleanupErr) console.error(`flagged_questions cleanup: ${flagCleanupErr.message}`)
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs, refsTwo, refsBig, refsEmpty] })
  })

  beforeEach(async () => {
    await clearActiveSessions({ admin, orgId })
  })

  it('starts a quick_quiz session over ids drawn from the eligible pool', async () => {
    const { data, error } = await start(studentClient)
    expect(error).toBeNull()
    const result = requireRpcResult<StartResult>(data, 'start_practice_quiz')
    const pool = [...questionIds, ...topicTwoQuestionIds]
    expect(result.question_ids).toHaveLength(3)
    expect(new Set(result.question_ids).size).toBe(3)
    for (const id of result.question_ids) expect(pool).toContain(id)

    const rows = await sessionRows(result.session_id as string)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.mode).toBe('quick_quiz')
    expect(rows[0]?.subject_id).toBe(refs.subjectId)
    expect(rows[0]?.student_id).toBe(studentId)
    expect(rows[0]?.total_questions).toBe(3)
    expect(rows[0]?.config.question_ids).toEqual(result.question_ids)
  })

  it('records the quiz_session.started audit event', async () => {
    const { data } = await start(studentClient)
    const result = requireRpcResult<StartResult>(data, 'start_practice_quiz')
    const { data: events, error } = await admin
      .from('audit_events')
      .select('event_type, actor_id')
      .eq('resource_id', result.session_id)
    expect(error).toBeNull()
    expect(events).toHaveLength(1)
    expect(events?.[0]?.event_type).toBe('quiz_session.started')
    expect(events?.[0]?.actor_id).toBe(studentId)
  })

  it('stores the topic id for a single topic and null for several', async () => {
    const one = requireRpcResult<StartResult>(
      (await start(studentClient, { p_topic_ids: [refs.topicId], p_count: 2 })).data,
      'single topic',
    )
    const oneRows = await sessionRows(one.session_id as string)
    expect(oneRows[0]?.topic_id).toBe(refs.topicId)
    for (const id of one.question_ids) expect(questionIds).toContain(id)

    await clearActiveSessions({ admin, orgId })
    const many = requireRpcResult<StartResult>(
      (await start(studentClient, { p_topic_ids: [refs.topicId, refsTwo.topicId], p_count: 8 }))
        .data,
      'two topics',
    )
    const manyRows = await sessionRows(many.session_id as string)
    expect(manyRows[0]?.topic_id).toBeNull()
    expect(many.question_ids).toHaveLength(8)
  })

  it('starts a session for a topic plus a subtopic of another topic, with no single topic stored', async () => {
    expect(questionIds.length + topicTwoQuestionIds.length).toBe(8)
    const { data, error } = await start(studentClient, {
      p_topic_ids: [refs.topicId],
      p_subtopic_ids: [refsTwo.subtopicId],
      p_count: 8,
    })
    expect(error).toBeNull()
    const result = requireRpcResult<StartResult>(data, 'topic + foreign subtopic')
    expect(result.question_ids).toHaveLength(8)
    const rows = await sessionRows(result.session_id as string)
    expect(rows[0]?.topic_id).toBeNull()
  })

  it("ignores the 'all' sentinel in p_filters", async () => {
    const all = requireRpcResult<StartResult>(
      (await start(studentClient, { p_filters: ['all'], p_count: 8 })).data,
      "p_filters=['all']",
    )
    expect(all.session_id).not.toBeNull()
    expect(all.question_ids).toHaveLength(8)

    await clearActiveSessions({ admin, orgId })
    const flaggedId = questionIds[1] as string
    const { error: flagErr } = await admin
      .from('flagged_questions')
      .upsert({ student_id: studentId, question_id: flaggedId, deleted_at: null })
    if (flagErr) throw new Error(`flag: ${flagErr.message}`)
    const mixed = requireRpcResult<StartResult>(
      (await start(studentClient, { p_filters: ['all', 'flagged'], p_count: 8 })).data,
      "p_filters=['all','flagged']",
    )
    expect(mixed.question_ids).toEqual([flaggedId])
    const { data: unflagged, error: unflagErr } = await admin
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('question_id', flaggedId)
      .select('question_id')
    expect(unflagErr).toBeNull()
    expect(unflagged).toHaveLength(1)
  })

  it('applies the filters: flagged draws only flagged questions', async () => {
    const flaggedId = questionIds[0] as string
    const { error: flagErr } = await admin
      .from('flagged_questions')
      .insert({ student_id: studentId, question_id: flaggedId })
    if (flagErr) throw new Error(`flag: ${flagErr.message}`)

    const result = requireRpcResult<StartResult>(
      (await start(studentClient, { p_filters: ['flagged'], p_count: 5 })).data,
      'flagged filter',
    )
    expect(result.question_ids).toEqual([flaggedId])

    // Un-flag (soft delete) so later tests see no active flag; the 'nothing matches'
    // test then also proves a soft-deleted flag is excluded from the pool.
    const { data: unflagged, error: unflagErr } = await admin
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('question_id', flaggedId)
      .select('question_id')
    if (unflagErr) throw new Error(`unflag: ${unflagErr.message}`)
    expect(unflagged).toHaveLength(1)
  })

  it('returns a null session and no row when nothing matches', async () => {
    const before = await countSessions()
    const empty = requireRpcResult<StartResult>(
      (await start(studentClient, { p_subject_id: refsEmpty.subjectId })).data,
      'empty subject',
    )
    expect(empty.session_id).toBeNull()
    expect(empty.question_ids).toEqual([])

    const noFlags = requireRpcResult<StartResult>(
      (await start(studentClient, { p_filters: ['flagged'] })).data,
      'flagged, none flagged',
    )
    expect(noFlags.session_id).toBeNull()
    expect(noFlags.question_ids).toEqual([])
    expect(await countSessions()).toBe(before)
  })

  it('draws nothing for a NULL or negative p_count', async () => {
    expect(questionIds.length).toBeGreaterThan(0)
    for (const p_count of [null, -5, 0]) {
      const { data, error } = await start(studentClient, { p_count })
      expect(error).toBeNull()
      const result = requireRpcResult<StartResult>(data, `p_count=${p_count}`)
      expect(result.session_id).toBeNull()
      expect(result.question_ids).toEqual([])
    }
  })

  it('clamps p_count to 500', async () => {
    const result = requireRpcResult<StartResult>(
      (await start(studentClient, { p_subject_id: refsBig.subjectId, p_count: 10000 })).data,
      'p_count=10000',
    )
    expect(result.question_ids).toHaveLength(500)
    const rows = await sessionRows(result.session_id as string)
    expect(rows[0]?.total_questions).toBe(500)
  })

  it('raises another_session_active when a session is already live and creates no row', async () => {
    const { error: seedErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        subject_id: refs.subjectId,
      })
      .select('id')
    if (seedErr) throw new Error(`seed live session: ${seedErr.message}`)
    expect(await countSessions()).toBe(1)

    const { data, error } = await start(studentClient)
    expect(error?.message).toContain('another_session_active')
    expect(data).toBeNull()
    expect(await countSessions()).toBe(1)
  })

  it('rejects a soft-deleted user', async () => {
    const { data: row, error: lookupErr } = await admin
      .from('users')
      .select('deleted_at')
      .eq('id', inactiveId)
      .single()
    expect(lookupErr).toBeNull()
    expect(row?.deleted_at).not.toBeNull()

    const { data, error } = await start(inactiveClient)
    expect(error?.message).toContain('user not found or inactive')
    expect(data).toBeNull()
    const { data: sessions, error: sessionsErr } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', inactiveId)
    expect(sessionsErr).toBeNull()
    expect(sessions).toHaveLength(0)
  })

  it('raises another_session_active when a quick_quiz is already live and creates no row', async () => {
    const first = requireRpcResult<StartResult>((await start(studentClient)).data, 'first start')
    expect(first.session_id).not.toBeNull()
    expect(await countSessions()).toBe(1)

    const { data, error } = await start(studentClient)
    expect(error?.message).toContain('another_session_active')
    expect(data).toBeNull()
    expect(await countSessions()).toBe(1)
    const rows = await sessionRows(first.session_id as string)
    expect(rows).toHaveLength(1)
  })

  it('denies an anonymous caller', async () => {
    const { data, error } = await start(getAnonClient())
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })
})
