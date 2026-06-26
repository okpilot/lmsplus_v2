// App-layer integration tier (#925) — getStudyQuestions.
//
// Exercises the real getStudyQuestions helper against real Postgres under real RLS.
// Validates:
//   - MC questions are delivered WITH correct_option_id (DELIBERATE Study-Mode exposure —
//     see migration 135 header and docs/security.md rule 1).
//   - Field mapping from the get_study_questions RETURNS TABLE to StudyQuestion.
//   - Soft-deleted questions are excluded from results.
//   - Cross-org questions are excluded (org-scoping guard).
//   - An unauthenticated call is rejected (RPC raises "Not authenticated"; helper throws).
//
// NOTE: this test requires the local Supabase stack to have migration 135
// (20260626000200_get_study_questions.sql) applied. The migration is staged on this
// branch. Run `npx supabase db reset` + grant-fix + re-seed before running locally;
// CI resets and applies all migrations authorita­tively.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getStudyQuestions } from '@/lib/queries/study-queries'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentId: string
const email = `int-study-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

// Foreign-org fixtures for the cross-org isolation test.
let foreignOrgId: string
let foreignStudentId: string
let foreignRefs: ReferenceIds
let foreignQuestionIds: string[]

describe('getStudyQuestions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-study ${suffix}`,
      slug: `int-study-${suffix}`,
    })

    studentId = await createTestUser({
      admin,
      orgId,
      email,
      password,
      role: 'student',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `ST_${suffix}`,
      subjectName: `Study Subject ${suffix}`,
      topicCode: `ST_${suffix}_T1`,
      topicName: `Study Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds

    // Foreign-org: for the cross-org isolation test.
    foreignOrgId = await createTestOrg({
      admin,
      name: `int-study-foreign ${suffix}`,
      slug: `int-study-foreign-${suffix}`,
    })
    foreignStudentId = await createTestUser({
      admin,
      orgId: foreignOrgId,
      email: `int-study-foreign-${suffix}@test.local`,
      password,
      role: 'student',
    })
    foreignRefs = await seedReferenceData({
      admin,
      subjectCode: `FO_${suffix}`,
      subjectName: `Foreign Subject ${suffix}`,
      topicCode: `FO_${suffix}_T1`,
      topicName: `Foreign Topic ${suffix}`,
    })
    const foreignSeeded = await seedQuestions({
      admin,
      orgId: foreignOrgId,
      createdBy: foreignStudentId,
      subjectId: foreignRefs.subjectId,
      topicId: foreignRefs.topicId,
      count: 1,
    })
    foreignQuestionIds = foreignSeeded.questionIds
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentId] })
    } catch (e) {
      errors.push(`cleanupTestData(org): ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    try {
      await cleanupTestData({ admin, orgId: foreignOrgId, userIds: [foreignStudentId] })
    } catch (e) {
      errors.push(`cleanupTestData(foreignOrg): ${e instanceof Error ? e.message : String(e)}`)
    }

    try {
      await cleanupReferenceData({ admin, refs: [foreignRefs] })
    } catch (e) {
      errors.push(`cleanupReferenceData(foreign): ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns questions with correct_option_id populated for the authenticated student', async () => {
    await signInAs(email, password)

    // Non-vacuous: confirm the seeded questions exist before asserting the read.
    const { data: confirmRows, error: confirmErr } = await admin
      .from('questions')
      .select('id')
      .in('id', questionIds)
      .is('deleted_at', null)
    expect(confirmErr).toBeNull()
    expect(confirmRows).toHaveLength(3)

    const result = await getStudyQuestions(questionIds)

    // Non-vacuous: the result is non-empty, proving the RPC ran.
    expect(result.length).toBeGreaterThan(0)
    expect(result).toHaveLength(3)

    const q = result[0]!
    // DELIBERATE answer-key exposure — Study Mode shows the correct option.
    expect(q.correctOptionId).toBe('b')
    expect(typeof q.questionText).toBe('string')
    expect(q.questionText.length).toBeGreaterThan(0)
    expect(Array.isArray(q.options)).toBe(true)
    expect(q.options).toHaveLength(4)
    expect(q.options.map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(q.subjectCode).toBe(`ST_${suffix}`)
    expect(q.topicName).toBe(`Study Topic ${suffix}`)
  })

  it('throws when called without authentication', async () => {
    // No signInAs — the integration setup resets the cookie jar before each test,
    // so this runs as anon. The RPC raises "Not authenticated"; the helper surfaces
    // it as a thrown error (code-style §5: query helpers throw, never collapse to []).
    await expect(getStudyQuestions(questionIds)).rejects.toThrow('Failed to fetch study questions')
  })

  it('excludes soft-deleted questions from the result', async () => {
    await signInAs(email, password)

    // Soft-delete one of the three seeded questions via the service-role client.
    const [toDeleteId, ...remainingIds] = questionIds
    const { error: deleteErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', toDeleteId!)
    expect(deleteErr).toBeNull()

    try {
      const result = await getStudyQuestions(questionIds)

      // Only the 2 surviving questions must appear.
      expect(result).toHaveLength(2)
      const resultIds = result.map((q) => q.id)
      expect(resultIds).not.toContain(toDeleteId)
      expect(resultIds).toEqual(expect.arrayContaining(remainingIds))
    } finally {
      // Restore so subsequent tests see all 3 questions. Surface a failed restore
      // (otherwise the shared seeded row stays soft-deleted and later tests become
      // order-dependent). Logged rather than thrown — Biome noUnsafeFinally forbids
      // throw-in-finally, which would also mask a real assertion failure from try.
      const { data: restored, error: restoreErr } = await admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', toDeleteId!)
        .select('id')
      if (restoreErr) {
        console.error('[study-queries.integration] restore failed:', restoreErr.message)
      } else if ((restored?.length ?? 0) === 0) {
        console.error('[study-queries.integration] restore matched no rows for id:', toDeleteId)
      }
    }
  })

  it('returns an empty array for question ids from a different organisation', async () => {
    await signInAs(email, password)

    // Non-vacuous: confirm the foreign question exists.
    const { data: foreignRow, error: foreignErr } = await admin
      .from('questions')
      .select('id')
      .in('id', foreignQuestionIds)
      .is('deleted_at', null)
    expect(foreignErr).toBeNull()
    expect(foreignRow).toHaveLength(1)

    // As a student in orgId, foreign-org ids must not surface (org-scope guard).
    const result = await getStudyQuestions(foreignQuestionIds)
    expect(result).toEqual([])
  })

  it('returns an empty array for an empty id list without calling the RPC', async () => {
    await signInAs(email, password)
    const result = await getStudyQuestions([])
    expect(result).toEqual([])
  })

  it('returns questions with the explanation text populated', async () => {
    await signInAs(email, password)

    const result = await getStudyQuestions(questionIds)
    // Non-vacuous: a regression to [] must fail here, not pass the empty loop.
    expect(result).toHaveLength(3)
    for (const q of result) {
      // seedQuestions seeds "Explanation for question N" — non-null.
      expect(typeof q.explanationText).toBe('string')
      expect((q.explanationText ?? '').length).toBeGreaterThan(0)
    }
  })
})
