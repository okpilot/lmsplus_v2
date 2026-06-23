// App-layer integration tier (#925) — getSessionReports.
//
// Exercises the real getSessionReports helper (get_session_reports RPC with
// pagination, sort, and dir) against real Postgres under real RLS. Validates
// pagination, sort order (non-strict monotonic for score sort with ties),
// subject_name join, out-of-range page probe, and RLS self-scope.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCompletedSessions } from '@/lib/integration-support/fixtures'
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
import { getSessionReports } from '@/lib/queries/reports'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-rep-a-${suffix}@test.local`
const emailB = `int-rep-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

// Session IDs captured so the RLS isolation test can compare against them.
let sessionIdsA: string[]
let sessionIdsB: string[]

// Alternating pattern: 3,1,3,1,3,1,3,1,3,1,3,1 (6×3, 6×1) across 12 sessions.
// Two distinct values ensures score-sort is non-vacuous (can't be satisfied by a constant).
const CORRECT_COUNTS = [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1]

describe('getSessionReports (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-rep ${suffix}`,
      slug: `int-rep-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
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
      subjectCode: `RP_${suffix}`,
      subjectName: `Reports Subject ${suffix}`,
      topicCode: `RP_${suffix}_T1`,
      topicName: `Reports Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })

    // Student A: 12 sessions with 2 distinct correctCounts to exercise score sort.
    sessionIdsA = await seedCompletedSessions({
      studentClient: studentAClient,
      questionIds,
      count: 12,
      correctCounts: CORRECT_COUNTS,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })

    // Student B: 3 sessions for RLS isolation.
    sessionIdsB = await seedCompletedSessions({
      studentClient: studentBClient,
      questionIds,
      count: 3,
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

  it('returns 10 sessions on page 1 with totalCount 12 (date desc)', async () => {
    await signInAs(emailA, password)

    const r = await getSessionReports({ page: 1, sort: 'date', dir: 'desc' })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.totalCount).toBe(12)
    expect(r.sessions).toHaveLength(10)
  })

  it('returns 2 sessions on page 2', async () => {
    await signInAs(emailA, password)

    const r = await getSessionReports({ page: 2, sort: 'date', dir: 'desc' })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.sessions).toHaveLength(2)
  })

  it('returns empty sessions with totalCount 12 for an out-of-range page', async () => {
    // probeOutOfRangeTotal fires when page > totalPages and no rows are returned.
    await signInAs(emailA, password)

    const r = await getSessionReports({ page: 5, sort: 'date', dir: 'desc' })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.sessions).toHaveLength(0)
    expect(r.totalCount).toBe(12)
  })

  it('returns sessions with correct row shape including subject name', async () => {
    await signInAs(emailA, password)

    const r = await getSessionReports({ page: 1, sort: 'date', dir: 'desc' })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    const session = r.sessions[0]
    expect(session).toBeDefined()
    expect(session?.mode).toBe('quick_quiz')
    expect(session?.totalQuestions).toBe(3)
    // subjectId was passed to seedCompletedSessions → subject_name join is exercised.
    expect(session?.subjectName).toBe(`Reports Subject ${suffix}`)
    expect(typeof session?.durationMinutes).toBe('number')
    expect(session?.durationMinutes).toBeGreaterThanOrEqual(0)
  })

  it('returns sessions sorted non-strictly ascending by score', async () => {
    // With only 2 distinct score values (1/3 ≈ 33% and 3/3 = 100%), ties are
    // expected — assert non-strict monotonic (<=), not strict (<).
    await signInAs(emailA, password)

    const r = await getSessionReports({ page: 1, sort: 'score', dir: 'asc' })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    const scores = r.sessions.map((s) => s.scorePercentage).filter((p): p is number => p !== null)
    // Non-strict monotonic (ties allowed): an already non-decreasing list equals its own sort.
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('self-scopes to the authenticated student and excludes other students sessions', async () => {
    // Non-vacuous: B has 3 sessions. If RLS over-scopes, totalCount would be 15.
    // Every returned session.id must belong to A's captured set.
    await signInAs(emailA, password)

    const r = await getSessionReports({ page: 1, sort: 'date', dir: 'desc' })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.totalCount).toBe(12)

    const aSet = new Set(sessionIdsA)
    const bSet = new Set(sessionIdsB)
    for (const session of r.sessions) {
      expect(aSet.has(session.id)).toBe(true)
      expect(bSet.has(session.id)).toBe(false)
    }
  })

  it('rejects a soft-deleted caller and does not leak their session history (#883)', async () => {
    // Positive control (non-vacuous): while active, B sees their own 3 sessions —
    // so a missing active-user gate would return them.
    await signInAs(emailB, password)
    const active = await getSessionReports({ page: 1, sort: 'date', dir: 'desc' })
    expect(active.ok).toBe(true)
    if (!active.ok) throw new Error(active.error)
    expect(active.totalCount).toBe(3)

    // Soft-delete B (deactivation does NOT cascade to quiz_sessions, so the per-session
    // ownership filter still matches). The active-user gate (mig 122) fires first and must
    // refuse even B's own owned, completed sessions.
    const { error: softDeleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentBId)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      await signInAs(emailB, password)
      const r = await getSessionReports({ page: 1, sort: 'date', dir: 'desc' })
      expect(r.ok).toBe(false)
    } finally {
      const { error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentBId)
      if (restoreErr) {
        console.error('[#883 soft-delete restore] studentB left soft-deleted:', restoreErr.message)
      }
    }
  })
})
