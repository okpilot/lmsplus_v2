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
  let refsOld: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  let refsDel: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  let questionsA: string[] = []
  let questionsB: string[] = []
  let questionsVictim: string[] = []
  let questionsOld: string[] = []
  let questionsDel: string[] = []
  // Day of the beforeAll inserts, read back from the DB once (never recomputed per test).
  let seededDay = ''
  let backdatedDay = ''
  const userIds: string[] = []
  const suffix = fixtureSuffix()
  const studentEmail = `student-dailysubj-${suffix}@test.local`
  const victimEmail = `victim-dailysubj-${suffix}@test.local`

  async function insertResponse(studentUuid: string, questionId: string, createdAt?: string) {
    const { error } = await admin.from('student_responses').insert({
      student_id: studentUuid,
      question_id: questionId,
      organization_id: orgId,
      is_correct: true,
      response_time_ms: 1000,
      // satisfies student_responses_answer_shape_check (selected_option_id NULL, response_text set)
      response_text: 'test',
      ...(createdAt ? { created_at: createdAt } : {}),
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

  function utcDay(isoTimestamp: string): string {
    // The DB session is UTC, so created_at::date is the UTC calendar day.
    return new Date(isoTimestamp).toISOString().slice(0, 10)
  }

  async function dailySubjects(days: number): Promise<DailySubjectRow[]> {
    const { data, error } = await studentClient.rpc('get_daily_subjects', { p_days: days })
    expect(error).toBeNull()
    return requireRpcRows<DailySubjectRow>(data, 'get_daily_subjects')
  }

  async function createUsers() {
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
  }

  async function readResponseDay(questionId: string): Promise<string> {
    const { data, error } = await admin
      .from('student_responses')
      .select('created_at')
      .eq('student_id', studentId)
      .eq('question_id', questionId)
      .single()
    if (error || !data) throw new Error(`read response day: ${error?.message}`)
    return utcDay(data.created_at as string)
  }

  async function seedCallerResponses() {
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

    // Read the seeded day back from the DB once; tests assert against this stored value.
    seededDay = await readResponseDay(questionsA[0] as string)
  }

  async function seedBoundaryFixtures() {
    // Subject answered ONLY three days before the seeded day (window-boundary fixture).
    const old = await seedSubject('DO')
    refsOld = old.refs
    questionsOld = old.questionIds
    const backdated = new Date(`${seededDay}T12:00:00Z`)
    backdated.setUTCDate(backdated.getUTCDate() - 3)
    backdatedDay = backdated.toISOString().slice(0, 10)
    await insertResponse(studentId, questionsOld[0] as string, backdated.toISOString())

    // Subject answered only today, only via one question (soft-delete fixture).
    const del = await seedSubject('DD')
    refsDel = del.refs
    questionsDel = del.questionIds
    await insertResponse(studentId, questionsDel[0] as string)
  }

  // The DB's current day, read at call time: get_daily_activity(p_days: 1) returns exactly today.
  async function dbToday(): Promise<string> {
    const { data, error } = await studentClient.rpc('get_daily_activity', {
      p_student_id: studentId,
      p_days: 1,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<{ day: string }>(data, 'get_daily_activity')
    expect(rows).toHaveLength(1)
    return (rows[0] as { day: string }).day
  }

  function daysBetween(fromDay: string, toDay: string): number {
    return Math.round(
      (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000,
    )
  }

  beforeAll(async () => {
    await createUsers()
    await seedCallerResponses()
    await seedBoundaryFixtures()
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
          refs: [
            refsA ?? undefined,
            refsB ?? undefined,
            refsVictim ?? undefined,
            refsOld ?? undefined,
            refsDel ?? undefined,
          ],
        })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns every subject the student answered today', async () => {
    const rows = await dailySubjects(7)
    const today = rows.filter((r) => r.day === seededDay).map((r) => r.subject_id)
    expect(today).toContain(refsA?.subjectId)
    expect(today).toContain(refsB?.subjectId)
  })

  it('lists a subject once per day however many answers it has', async () => {
    const rows = await dailySubjects(7)
    // Two answers were seeded in subject A; positive control that both exist.
    const { data: answers, error: ansErr } = await admin
      .from('student_responses')
      .select('id')
      .eq('student_id', studentId)
      .in('question_id', questionsA)
    if (ansErr) throw new Error(`count answers: ${ansErr.message}`)
    expect((answers ?? []).length).toBe(2)
    const matching = rows.filter((r) => r.day === seededDay && r.subject_id === refsA?.subjectId)
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

  it('buckets days the same way as the daily activity chart', async () => {
    const days = 7
    const rows = await dailySubjects(days)
    const { data, error } = await studentClient.rpc('get_daily_activity', {
      p_student_id: studentId,
      p_days: days,
    })
    expect(error).toBeNull()
    const activity = requireRpcRows<{ day: string; total: number | string }>(
      data,
      'get_daily_activity',
    )
    const activeDays = new Set(activity.filter((a) => Number(a.total) > 0).map((a) => a.day))
    const subjectDays = new Set(rows.map((r) => r.day))
    expect(subjectDays.size).toBeGreaterThan(0)
    expect([...subjectDays].sort()).toEqual([...activeDays].sort())
  })

  it('excludes a day just outside the lookback window and includes it once the window widens', async () => {
    // Window start is CURRENT_DATE - (p_days - 1), evaluated at call time: derive n from the DB's
    // current day so a midnight rollover after beforeAll cannot shift the boundary.
    const n = daysBetween(backdatedDay, await dbToday())
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n + 1).toBeLessThanOrEqual(365)
    const narrow = await dailySubjects(n)
    expect(narrow).not.toContainEqual({ day: backdatedDay, subject_id: refsOld?.subjectId })
    const wide = await dailySubjects(n + 1)
    expect(wide).toContainEqual({ day: backdatedDay, subject_id: refsOld?.subjectId })
  })

  describe('soft-deleted question', () => {
    let questionSoftDeleted = false

    afterEach(async () => {
      if (!questionSoftDeleted) return
      const { data: restored, error: restoreErr } = await admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', questionsDel[0] as string)
        .select('id')
      if (restoreErr) throw new Error(`[question cleanup] restore failed: ${restoreErr.message}`)
      if ((restored ?? []).length === 0)
        throw new Error('[question cleanup] restore affected 0 rows')
      questionSoftDeleted = false
    })

    it('drops a subject once its only answered question is soft-deleted', async () => {
      // The DD response's own day; window 7 survives a midnight rollover since seeding.
      const delDay = await readResponseDay(questionsDel[0] as string)
      const before = await dailySubjects(7)
      expect(before).toContainEqual({ day: delDay, subject_id: refsDel?.subjectId })

      const { data: deleted, error: delErr } = await admin
        .from('questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', questionsDel[0] as string)
        .is('deleted_at', null)
        .select('id')
      if (delErr) throw new Error(`soft-delete question: ${delErr.message}`)
      expect((deleted ?? []).length).toBe(1)
      questionSoftDeleted = true

      const after = await dailySubjects(7)
      expect(after.map((r) => r.subject_id)).not.toContain(refsDel?.subjectId)
      // The caller's other subjects are unaffected.
      expect(after.map((r) => r.subject_id)).toContain(refsA?.subjectId)
    })
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
    it.each([0, 366, null])('rejects a lookback window of %s days', async (days) => {
      // null is outside the typed signature (p_days: number); cast to reach the RPC's NULL guard.
      const { data, error } = await studentClient.rpc('get_daily_subjects', {
        p_days: days as unknown as number,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('p_days must be between 1 and 365')
      expect(data).toBeNull()
    })
  })
})
