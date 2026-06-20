// App-layer integration tier (#925) — getProfileData.
//
// Exercises the real getProfileData helper (users SELECT, organizations SELECT,
// get_student_profile_stats RPC, student_responses count) against real Postgres
// under real RLS. Validates field mapping, stats aggregation, and RLS self-scope.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCompletedSession } from '@/lib/integration-support/fixtures'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getProfileData } from '@/lib/queries/profile'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let orgName: string
let studentAId: string
let studentBId: string
const emailA = `int-prof-a-${suffix}@test.local`
const emailB = `int-prof-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

// Captured DB-returned scorePercentages used to build expectations without JS recomputation.
let scorePercentage1: number
let scorePercentage2: number

describe('getProfileData (app-layer integration)', () => {
  beforeAll(async () => {
    orgName = `int-prof ${suffix}`
    orgId = await createTestOrg({
      admin,
      name: orgName,
      slug: `int-prof-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
      fullName: 'Test Student',
    })

    studentBId = await createTestUser({
      admin,
      orgId,
      email: emailB,
      password,
      role: 'student',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `PF_${suffix}`,
      subjectName: `Profile Subject ${suffix}`,
      topicCode: `PF_${suffix}_T1`,
      topicName: `Profile Topic ${suffix}`,
    })

    // Seed 6 questions; use disjoint pools for 2 sessions so totalAnswered = 6.
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 6,
    })
    questionIds = seeded.questionIds

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })

    // Session 1: first 3 questions, all 3 correct → 100%.
    const s1 = await seedCompletedSession({
      studentClient: studentAClient,
      questionIds: questionIds.slice(0, 3),
      correctCount: 3,
    })
    scorePercentage1 = s1.scorePercentage

    // Session 2: next 3 questions, 2 correct → ~67%.
    const s2 = await seedCompletedSession({
      studentClient: studentAClient,
      questionIds: questionIds.slice(3, 6),
      correctCount: 2,
    })
    scorePercentage2 = s2.scorePercentage

    // Student B: 2 sessions to verify RLS self-scope (B's sessions must not appear in A's profile).
    await seedCompletedSession({
      studentClient: studentBClient,
      questionIds: questionIds.slice(0, 3),
      correctCount: 1,
    })
    await seedCompletedSession({
      studentClient: studentBClient,
      questionIds: questionIds.slice(3, 6),
      correctCount: 1,
    })
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentAId, studentBId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns correctly mapped profile fields including organization name', async () => {
    await signInAs(emailA, password)

    const data = await getProfileData()

    expect(data.fullName).toBe('Test Student')
    expect(data.email).toBe(emailA)
    expect(data.organizationName).toBe(orgName)
    expect(typeof data.memberSince).toBe('string')
    expect(data.memberSince.length).toBeGreaterThan(0)
  })

  it('returns correct aggregated stats for the authenticated student', async () => {
    await signInAs(emailA, password)

    const data = await getProfileData()

    expect(data.stats.totalSessions).toBe(2)
    expect(data.stats.totalAnswered).toBe(6)
    // averageScore is Math.round of the DB average of the two DB-returned scorePercentages.
    const expectedAvg = Math.round((scorePercentage1 + scorePercentage2) / 2)
    expect(data.stats.averageScore).toBe(expectedAvg)
  })

  it('self-scopes stats to the authenticated student and excludes other students', async () => {
    // Non-vacuous: B has 2 sessions. If RLS leaks B into A, totalSessions would be 4.
    await signInAs(emailA, password)

    const data = await getProfileData()

    expect(data.stats.totalSessions).toBe(2)
  })
})
