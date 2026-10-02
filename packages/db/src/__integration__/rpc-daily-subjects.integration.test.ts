import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcRows } from './guards'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// get_daily_subjects (mig 20261002000100): (day, subject_id) pairs the caller practised.

type DailySubjectRow = { day: string; subject_id: string }

const PASSWORD = 'test-pass-123'

describe('RPC: get_daily_subjects', () => {
  const admin = getAdminClient()
  let orgId = ''
  let studentId = ''
  let victimId = ''
  let studentClient: SupabaseClient
  let refsA: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  let refsB: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  let refsVictim: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  let questionsA: string[] = []
  let questionsB: string[] = []
  let questionsVictim: string[] = []
  const userIds: string[] = []
  const suffix = fixtureSuffix()
  const studentEmail = `student-dailysubj-${suffix}@test.local`
  const victimEmail = `victim-dailysubj-${suffix}@test.local`

  async function insertResponse(studentUuid: string, questionId: string) {
    const { error } = await admin.from('student_responses').insert({
      student_id: studentUuid,
      question_id: questionId,
      organization_id: orgId,
      is_correct: true,
      response_time_ms: 1000,
      // satisfies student_responses_answer_shape_check (selected_option_id NULL, response_text set)
      response_text: 'test',
    })
    if (error) throw new Error(`seed student_responses: ${error.message}`)
  }

  async function seedSubject(code: string) {
    const refs = await seedReferenceData({
      admin,
      subjectCode: `${code}${suffix}`,
      subjectName: `Daily Subject ${code} ${suffix}`,
      topicCode: `${code}${suffix}-01`,
      topicName: `Daily Topic ${code} ${suffix}`,
    })
    const { questionIds } = await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 2,
    })
    return { refs, questionIds }
  }

  function todayUtc(): string {
    // CURRENT_DATE in the DB session is UTC; created_at defaults to now().
    return new Date().toISOString().slice(0, 10)
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DailySubj ${suffix}`,
      slug: `test-dailysubj-${suffix}`,
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password: PASSWORD,
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({ email: studentEmail, password: PASSWORD })
    victimId = await createTestUser({
      admin,
      orgId,
      email: victimEmail,
      password: PASSWORD,
      role: 'student',
    })
    userIds.push(victimId)

    const a = await seedSubject('DA')
    refsA = a.refs
    questionsA = a.questionIds
    const b = await seedSubject('DB')
    refsB = b.refs
    questionsB = b.questionIds
    const v = await seedSubject('DV')
    refsVictim = v.refs
    questionsVictim = v.questionIds

    // Caller: two responses in subject A (same day), one in subject B.
    await insertResponse(studentId, questionsA[0] as string)
    await insertResponse(studentId, questionsA[1] as string)
    await insertResponse(studentId, questionsB[0] as string)
    // Victim: a response in a subject the caller never answered.
    await insertResponse(victimId, questionsVictim[0] as string)
  })

  afterAll(async () => {
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({
          admin,
          refs: [refsA ?? undefined, refsB ?? undefined, refsVictim ?? undefined],
        })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns every subject the student answered today', async () => {
    const { data, error } = await studentClient.rpc('get_daily_subjects', { p_days: 7 })
    expect(error).toBeNull()
    const rows = requireRpcRows<DailySubjectRow>(data, 'get_daily_subjects')
    const today = rows.filter((r) => r.day === todayUtc()).map((r) => r.subject_id)
    expect(today).toContain(refsA?.subjectId)
    expect(today).toContain(refsB?.subjectId)
  })

  it('lists a subject once per day however many answers it has', async () => {
    const { data, error } = await studentClient.rpc('get_daily_subjects', { p_days: 7 })
    expect(error).toBeNull()
    const rows = requireRpcRows<DailySubjectRow>(data, 'get_daily_subjects')
    // Two answers were seeded in subject A; positive control that both exist.
    const { data: answers, error: ansErr } = await admin
      .from('student_responses')
      .select('id')
      .eq('student_id', studentId)
      .in('question_id', questionsA)
    if (ansErr) throw new Error(`count answers: ${ansErr.message}`)
    expect((answers ?? []).length).toBe(2)
    const matching = rows.filter((r) => r.day === todayUtc() && r.subject_id === refsA?.subjectId)
    expect(matching).toHaveLength(1)
  })

  it("does not return another student's practised subjects", async () => {
    const { data: victimRows, error: victimErr } = await admin
      .from('student_responses')
      .select('id')
      .eq('student_id', victimId)
      .in('question_id', questionsVictim)
    if (victimErr) throw new Error(`victim rows: ${victimErr.message}`)
    expect((victimRows ?? []).length).toBeGreaterThan(0)

    const { data, error } = await studentClient.rpc('get_daily_subjects', { p_days: 7 })
    expect(error).toBeNull()
    const rows = requireRpcRows<DailySubjectRow>(data, 'get_daily_subjects')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.subject_id)).not.toContain(refsVictim?.subjectId)
  })

  describe('active-user gate', () => {
    let userSoftDeleted = false

    afterEach(async () => {
      if (!userSoftDeleted) return
      const { data: restored, error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentId)
        .select('id')
      if (restoreErr) throw new Error(`[gate cleanup] restore user failed: ${restoreErr.message}`)
      if ((restored ?? []).length === 0)
        throw new Error('[gate cleanup] restore user affected 0 rows')
      userSoftDeleted = false
    })

    it('rejects a soft-deleted caller holding a live session', async () => {
      const before = await studentClient.rpc('get_daily_subjects', { p_days: 7 })
      expect(before.error).toBeNull()

      const { data: deleted, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', studentId)
        .is('deleted_at', null)
        .select('id')
      if (delErr) throw new Error(`soft-delete user: ${delErr.message}`)
      expect((deleted ?? []).length).toBe(1)
      userSoftDeleted = true

      const { data, error } = await studentClient.rpc('get_daily_subjects', { p_days: 7 })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('user not found or inactive')
      expect(data).toBeNull()
    })
  })

  describe('lookback window bounds', () => {
    it.each([0, 366])('rejects a lookback window of %i days', async (days) => {
      const { data, error } = await studentClient.rpc('get_daily_subjects', { p_days: days })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('p_days must be between 1 and 365')
      expect(data).toBeNull()
    })
  })
})
