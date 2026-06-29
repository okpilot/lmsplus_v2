import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// #1008 — the optional p_question_type AND-restriction on get_filtered_question_counts
// (and the shared filtered pool / get_random_question_ids, mig 134). Study/Discovery
// FETCHES an MC-only set, so its COUNT must also be MC-only or the slider max /
// Start button / count badge overstate the real pool. Exercises the REAL deployed
// functions under RLS as the student.
// Fixtures: 6 active questions in one subject — 4 multiple_choice, 2 short_answer.
describe('RPC: question-type filtered question pool (#1008)', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let mcIds: string[] // question_type = 'multiple_choice'
  let saIds: string[] // question_type = 'short_answer'
  const userIds: string[] = []
  const suffix = `${Date.now()}-qtype`

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org QType ${suffix}`,
      slug: `test-qtype-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-qtype-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-qtype-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-qtype-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SQ${suffix}`,
      subjectName: `QType Subject ${suffix}`,
      topicCode: `SQ${suffix}-01`,
      topicName: `QType Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 6,
    })
    mcIds = seeded.questionIds.slice(0, 4)
    saIds = seeded.questionIds.slice(4)

    // Convert the last two to short_answer. The type<->column discriminator
    // (mig 094) requires canonical_answer NOT NULL + dialog_template NULL +
    // blanks_config empty; the MC-key CHECK (mig 111) requires correct_option_id
    // NULL on non-MC rows. options is NOT NULL, so reset it to [].
    const { data: converted, error: convErr } = await admin
      .from('questions')
      .update({
        question_type: 'short_answer',
        canonical_answer: 'cleared to land',
        correct_option_id: null,
        options: [],
        // Set the discriminator columns explicitly so the short_answer type does not
        // depend on insert-time defaults: dialog_template NULL + blanks_config empty.
        dialog_template: null,
        blanks_config: [],
      })
      .in('id', saIds)
      .select('id')
    if (convErr) throw new Error(`convert short_answer: ${convErr.message}`)
    if (converted?.length !== 2) {
      throw new Error(`convert short_answer: expected 2 rows, got ${converted?.length}`)
    }
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  // Production (lookup.ts) ALWAYS sends p_question_type: questionType ?? null, so the
  // helpers mirror that wire shape — pass an explicit null on the type-agnostic path
  // rather than dropping the key (#1008).
  async function countTotal(questionType: 'multiple_choice' | null = null): Promise<number> {
    const { data, error } = await studentClient.rpc('get_filtered_question_counts', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: [],
      p_question_type: questionType,
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('get_filtered_question_counts: non-array response')
    return data.reduce((sum, r) => sum + Number((r as { n: number | string }).n), 0)
  }

  async function poolIds(questionType: 'multiple_choice' | null = null): Promise<string[]> {
    const { data, error } = await studentClient.rpc('get_random_question_ids', {
      p_subject_id: refs.subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: [],
      p_question_type: questionType,
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('get_random_question_ids: non-array response')
    return data.map((r) => (r as { id: string }).id)
  }

  it('counts the whole pool when no question type is set', async () => {
    expect(await countTotal(null)).toBe(6)
  })

  it("counts only the multiple_choice questions when p_question_type is 'multiple_choice'", async () => {
    const mcCount = await countTotal('multiple_choice')
    expect(mcCount).toBe(4)
    // Non-vacuous: the MC-aware count is strictly below the type-agnostic total,
    // proving the filter actually excluded the 2 short_answer rows.
    expect(mcCount).toBeLessThan(await countTotal())
  })

  it("samples only multiple_choice ids when p_question_type is 'multiple_choice'", async () => {
    const ids = await poolIds('multiple_choice')
    expect(ids.length).toBeGreaterThan(0) // non-vacuous
    expect(new Set(ids)).toEqual(new Set(mcIds))
    for (const saId of saIds) expect(ids).not.toContain(saId)
  })

  it('samples the whole pool when no question type is set', async () => {
    const ids = await poolIds(null)
    expect(new Set(ids)).toEqual(new Set([...mcIds, ...saIds]))
  })
})
