import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// #864 — the has-image (p_has_image) AND-restriction on the shared filtered
// question pool. Exercises the REAL deployed functions under RLS as the student.
// Fixtures: 6 active questions in one subject, 2 carrying a question_image_url.
describe('RPC: has-image filtered question pool (#864)', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let imageIds: string[] // question_image_url IS NOT NULL
  let noImageIds: string[] // question_image_url IS NULL
  const userIds: string[] = []
  const suffix = `${Date.now()}-img`

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Img ${suffix}`,
      slug: `test-img-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-img-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-img-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-img-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SI${suffix}`,
      subjectName: `Image Subject ${suffix}`,
      topicCode: `SI${suffix}-01`,
      topicName: `Image Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 6,
    })
    imageIds = seeded.questionIds.slice(0, 2)
    noImageIds = seeded.questionIds.slice(2)

    // Give the first two questions an image url.
    const { data: tagged, error: tagErr } = await admin
      .from('questions')
      .update({ question_image_url: 'https://example.com/diagram.png' })
      .in('id', imageIds)
      .select('id')
    if (tagErr) throw new Error(`tag image: ${tagErr.message}`)
    if (tagged?.length !== 2) throw new Error(`tag image: expected 2 rows, got ${tagged?.length}`)
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  async function poolIds(
    imageMode: 'all' | 'only' | 'exclude',
    filters: string[] = [],
  ): Promise<string[]> {
    const { data, error } = await studentClient.rpc('get_random_question_ids', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: filters,
      p_calc_mode: 'all',
      p_has_image: imageMode,
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('get_random_question_ids: non-array response')
    return data.map((r) => (r as { id: string }).id)
  }

  async function countTotal(
    imageMode: 'all' | 'only' | 'exclude',
    filters: string[] = [],
  ): Promise<number> {
    const { data, error } = await studentClient.rpc('get_filtered_question_counts', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: filters,
      p_calc_mode: 'all',
      p_has_image: imageMode,
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('get_filtered_question_counts: non-array response')
    return data.reduce((sum, r) => sum + Number((r as { n: number | string }).n), 0)
  }

  it("has-image 'all' returns the whole pool (image + no-image)", async () => {
    const ids = await poolIds('all')
    expect(ids).toHaveLength(6)
    expect(new Set(ids)).toEqual(new Set([...imageIds, ...noImageIds]))
  })

  it("has-image 'only' returns exactly the questions with an image", async () => {
    const ids = await poolIds('only')
    expect(ids.length).toBeGreaterThan(0) // non-vacuous
    expect(new Set(ids)).toEqual(new Set(imageIds))
    for (const noImage of noImageIds) expect(ids).not.toContain(noImage)
  })

  it("has-image 'exclude' returns exactly the questions without an image", async () => {
    const ids = await poolIds('exclude')
    expect(ids.length).toBeGreaterThan(0) // non-vacuous
    expect(new Set(ids)).toEqual(new Set(noImageIds))
    for (const image of imageIds) expect(ids).not.toContain(image)
  })

  it("omitting p_has_image defaults to all (DEFAULT 'all')", async () => {
    const { data, error } = await studentClient.rpc('get_random_question_ids', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: [],
      p_calc_mode: 'all',
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('non-array response')
    expect(data).toHaveLength(6)
  })

  it('counts match the pool size for each has-image mode (count == quiz)', async () => {
    expect(await countTotal('all')).toBe(6)
    expect(await countTotal('only')).toBe(2)
    expect(await countTotal('exclude')).toBe(4)
  })

  it('has-image AND-restricts on top of the unseen OR-filter (only + unseen)', async () => {
    // Mark one image question as "seen" by inserting a student_response for it.
    const seenImageId = imageIds[0]!
    const unseenImageId = imageIds[1]!
    const { data: resp, error: respErr } = await admin
      .from('student_responses')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        question_id: seenImageId,
        selected_option_id: 'b',
        is_correct: true,
        response_time_ms: 1000,
      })
      .select('id')
    if (respErr) throw new Error(`seed response: ${respErr.message}`)
    if (!resp?.length) throw new Error('seed response: zero rows')

    // unseen alone excludes the one seen image question, keeps everything else.
    const unseen = await poolIds('all', ['unseen'])
    expect(unseen).not.toContain(seenImageId)
    expect(unseen).toContain(unseenImageId)

    // only + unseen = has-image AND not-yet-seen = just the unseen image question.
    const onlyUnseen = await poolIds('only', ['unseen'])
    expect(onlyUnseen).toEqual([unseenImageId]) // non-vacuous: exactly one survivor
    expect(onlyUnseen).not.toContain(seenImageId) // seen image excluded by unseen
    for (const noImage of noImageIds) expect(onlyUnseen).not.toContain(noImage) // no-image excluded by only
  })
})
