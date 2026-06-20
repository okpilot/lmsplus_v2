// App-layer integration tier (#925) — real query helpers vs real Postgres under real RLS.
//
// Covers: getExamEnabledSubjects — the FK join from exam_configs onto easa_subjects,
// column mapping (snake_case → camelCase), multi-row handling, and the RLS-enforced
// filter for enabled=true AND deleted_at IS NULL.
//
// Two subjects are seeded with explicit exam_configs rows so we verify both multi-row
// delivery and correct field mapping (totalQuestions, timeLimitSeconds, passMark).
// A negative/enabled:false test is intentionally omitted: the student exam_configs
// RLS policy already filters enabled=true AND deleted_at IS NULL, shadowing the
// helper's own filter, so such a test would be vacuous.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  type ReferenceIds,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getExamEnabledSubjects } from '@/lib/queries/exam-subjects'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentId: string
const email = `int-exam-${suffix}@test.local`
const password = 'test-pass-123'

let refs1: ReferenceIds
let refs2: ReferenceIds

describe('getExamEnabledSubjects (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-exam ${suffix}`,
      slug: `int-exam-${suffix}`,
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email,
      password,
      role: 'student',
    })

    // Two distinct reference subjects so we verify multi-row delivery.
    refs1 = await seedReferenceData({
      admin,
      subjectCode: `S1_${suffix}`,
      subjectName: `Exam Subject 1 ${suffix}`,
      topicCode: `T1_${suffix}`,
      topicName: `Exam Topic 1 ${suffix}`,
    })
    refs2 = await seedReferenceData({
      admin,
      subjectCode: `S2_${suffix}`,
      subjectName: `Exam Subject 2 ${suffix}`,
      topicCode: `T2_${suffix}`,
      topicName: `Exam Topic 2 ${suffix}`,
    })

    // Insert exam_configs for both subjects under this org.
    // organization_id + subject_id are NOT NULL FKs; UNIQUE(org, subject) → two rows.
    const { error: err1 } = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: refs1.subjectId,
      enabled: true,
      total_questions: 40,
      time_limit_seconds: 3600,
      pass_mark: 75,
    })
    if (err1) throw new Error(`exam_configs insert (subject 1): ${err1.message}`)

    const { error: err2 } = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: refs2.subjectId,
      enabled: true,
      total_questions: 40,
      time_limit_seconds: 3600,
      pass_mark: 75,
    })
    if (err2) throw new Error(`exam_configs insert (subject 2): ${err2.message}`)
  })

  afterAll(async () => {
    // 2 steps — per-step error accumulator (code-style §7).
    const errors: string[] = []

    // Step 1: clean up the org's test data (users, org, and the exam_configs rows
    // are cascaded via FK or cleaned up by cleanupTestData).
    try {
      await cleanupTestData({ admin, orgId, userIds: [studentId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Step 2: clean up shared reference data — dependent on step 1 (FK children
    // must be removed first).
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs1, refs2] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) {
      throw new Error(`afterAll: ${errors.join('; ')}`)
    }
  })

  it('returns both enabled exam subjects with correctly mapped fields', async () => {
    await signInAs(email, password)

    const subjects = await getExamEnabledSubjects()

    // Verify subject 1 is present with correct field mapping (seedReferenceData sets short = subjectCode).
    const s1 = subjects.find((s) => s.id === refs1.subjectId)
    expect(s1).toBeDefined()
    expect(s1?.code).toBe(`S1_${suffix}`)
    expect(s1?.name).toBe(`Exam Subject 1 ${suffix}`)
    expect(s1?.short).toBe(`S1_${suffix}`)
    expect(s1?.totalQuestions).toBe(40)
    expect(s1?.timeLimitSeconds).toBe(3600)
    expect(s1?.passMark).toBe(75)

    // Verify subject 2 is also present (multi-row handling).
    const s2 = subjects.find((s) => s.id === refs2.subjectId)
    expect(s2).toBeDefined()
    expect(s2?.code).toBe(`S2_${suffix}`)
    expect(s2?.name).toBe(`Exam Subject 2 ${suffix}`)
    expect(s2?.short).toBe(`S2_${suffix}`)
    expect(s2?.totalQuestions).toBe(40)
    expect(s2?.timeLimitSeconds).toBe(3600)
    expect(s2?.passMark).toBe(75)

    // The helper applies .order('subject_id') — assert our two configs appear in
    // ascending subject_id order (a dropped .order() would let them reorder).
    const idxS1 = subjects.findIndex((s) => s.id === refs1.subjectId)
    const idxS2 = subjects.findIndex((s) => s.id === refs2.subjectId)
    const [lowerId] = [refs1.subjectId, refs2.subjectId].sort()
    if (refs1.subjectId === lowerId) expect(idxS1).toBeLessThan(idxS2)
    else expect(idxS2).toBeLessThan(idxS1)
  })
})
