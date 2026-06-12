import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// #837 — the calc-mode (p_calc_mode) AND-restriction on the shared filtered
// question pool. Exercises the REAL deployed functions under RLS as the student.
// Fixtures: 6 active questions in one subject, 2 tagged has_calculations=true.
describe('RPC: calc-mode filtered question pool (#837)', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let calcIds: string[] // has_calculations = true
  let nonCalcIds: string[] // has_calculations = false
  const userIds: string[] = []
  const suffix = `${Date.now()}-calc`

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Calc ${suffix}`,
      slug: `test-calc-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-calc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-calc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-calc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SC${suffix}`,
      subjectName: `Calc Subject ${suffix}`,
      topicCode: `SC${suffix}-01`,
      topicName: `Calc Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 6,
    })
    calcIds = seeded.questionIds.slice(0, 2)
    nonCalcIds = seeded.questionIds.slice(2)

    // Tag the first two as calculation questions.
    const { data: tagged, error: tagErr } = await admin
      .from('questions')
      .update({ has_calculations: true })
      .in('id', calcIds)
      .select('id')
    if (tagErr) throw new Error(`tag calc: ${tagErr.message}`)
    if (tagged?.length !== 2) throw new Error(`tag calc: expected 2 rows, got ${tagged?.length}`)
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  async function poolIds(
    calcMode: 'all' | 'only' | 'exclude',
    filters: string[] = [],
  ): Promise<string[]> {
    const { data, error } = await studentClient.rpc('get_random_question_ids', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: filters,
      p_calc_mode: calcMode,
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('get_random_question_ids: non-array response')
    return data.map((r) => (r as { id: string }).id)
  }

  async function countTotal(
    calcMode: 'all' | 'only' | 'exclude',
    filters: string[] = [],
  ): Promise<number> {
    const { data, error } = await studentClient.rpc('get_filtered_question_counts', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: filters,
      p_calc_mode: calcMode,
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('get_filtered_question_counts: non-array response')
    return data.reduce((sum, r) => sum + Number((r as { n: number | string }).n), 0)
  }

  it("calc-mode 'all' returns the whole pool (calc + non-calc)", async () => {
    const ids = await poolIds('all')
    expect(ids).toHaveLength(6)
    expect(new Set(ids)).toEqual(new Set([...calcIds, ...nonCalcIds]))
  })

  it("calc-mode 'only' returns exactly the calculation questions", async () => {
    const ids = await poolIds('only')
    expect(ids.length).toBeGreaterThan(0) // non-vacuous
    expect(new Set(ids)).toEqual(new Set(calcIds))
    for (const nonCalc of nonCalcIds) expect(ids).not.toContain(nonCalc)
  })

  it("calc-mode 'exclude' returns exactly the non-calculation questions", async () => {
    const ids = await poolIds('exclude')
    expect(ids.length).toBeGreaterThan(0) // non-vacuous
    expect(new Set(ids)).toEqual(new Set(nonCalcIds))
    for (const calc of calcIds) expect(ids).not.toContain(calc)
  })

  it("omitting p_calc_mode defaults to all (DEFAULT 'all')", async () => {
    const { data, error } = await studentClient.rpc('get_random_question_ids', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: [],
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('non-array response')
    expect(data).toHaveLength(6)
  })

  it('counts match the pool size for each calc-mode (count == quiz)', async () => {
    expect(await countTotal('all')).toBe(6)
    expect(await countTotal('only')).toBe(2)
    expect(await countTotal('exclude')).toBe(4)
  })

  it('calc-mode AND-restricts on top of the unseen OR-filter (only + unseen)', async () => {
    // Mark one calc question as "seen" by inserting a student_response for it.
    const seenCalcId = calcIds[0]!
    const unseenCalcId = calcIds[1]!
    const { data: resp, error: respErr } = await admin
      .from('student_responses')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        question_id: seenCalcId,
        selected_option_id: 'b',
        is_correct: true,
        response_time_ms: 1000,
      })
      .select('id')
    if (respErr) throw new Error(`seed response: ${respErr.message}`)
    if (!resp?.length) throw new Error('seed response: zero rows')

    // unseen alone excludes the one seen calc question, keeps everything else.
    const unseen = await poolIds('all', ['unseen'])
    expect(unseen).not.toContain(seenCalcId)
    expect(unseen).toContain(unseenCalcId)

    // only + unseen = calc AND not-yet-seen = just the unseen calc question.
    const onlyUnseen = await poolIds('only', ['unseen'])
    expect(onlyUnseen).toEqual([unseenCalcId]) // non-vacuous: exactly one survivor
    expect(onlyUnseen).not.toContain(seenCalcId) // seen calc excluded by unseen
    for (const nonCalc of nonCalcIds) expect(onlyUnseen).not.toContain(nonCalc) // non-calc excluded by only
  })
})
