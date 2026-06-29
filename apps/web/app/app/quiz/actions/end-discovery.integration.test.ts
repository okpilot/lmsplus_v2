// App-layer integration tier (#925 §7) — endDiscovery.
//
// Exercises the real endDiscovery Server Action against real Postgres under real
// RLS. The load-bearing assertion (a mocked client cannot catch it, #815-class):
// a STUDENT soft-deleting their OWN discovery row must be PERMITTED by the
// quiz_sessions RLS WITH CHECK — endDiscovery uses the user client, not the
// service role. We seed a real mode='discovery' row via start_discovery_session
// (mig 137) as the student, call endDiscovery as that student, then read back via
// the service role to confirm deleted_at was actually set under RLS.
//
// Also covers: clean no-op success when no discovery row is active, and cross-user
// isolation (student B's endDiscovery must not touch student A's discovery row).
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
import { endDiscovery } from './end-discovery'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-enddisc-a-${suffix}@test.local`
const emailB = `int-enddisc-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

// Read the deleted_at of a single quiz_sessions row via the service role (bypasses
// RLS, so it observes the true persisted state regardless of who wrote it).
async function readDeletedAt(sessionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('deleted_at')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`readDeletedAt(${sessionId}): ${error.message}`)
  if (data === null || typeof data !== 'object') {
    throw new Error(`readDeletedAt(${sessionId}): unexpected shape`)
  }
  return (data as { deleted_at: string | null }).deleted_at
}

// Seed a real active discovery session for the given student via the RPC under
// their own client (mode='discovery' is gated by start_discovery_session, mig 137).
async function seedDiscoverySession(client: SupabaseClient, ids: string[]): Promise<string> {
  const { data, error } = await client.rpc('start_discovery_session', {
    p_subject_id: refs.subjectId,
    p_question_ids: ids,
  })
  if (error) throw new Error(`seedDiscoverySession: ${error.message}`)
  if (typeof data !== 'string')
    throw new Error('seedDiscoverySession: expected a session id string')
  return data
}

describe('endDiscovery (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-enddisc ${suffix}`,
      slug: `int-enddisc-${suffix}`,
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
      subjectCode: `ED_${suffix}`,
      subjectName: `EndDisc Subject ${suffix}`,
      topicCode: `ED_${suffix}_T1`,
      topicName: `EndDisc Topic ${suffix}`,
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

  it("soft-deletes the caller's own active discovery session under real RLS", async () => {
    // Seed a real discovery row for student A as student A (proves the WITH CHECK
    // on quiz_sessions permits the student's own discovery insert too).
    const studentAClient = await getAuthenticatedClient({ email: emailA, password })
    const sessionId = await seedDiscoverySession(studentAClient, questionIds.slice(0, 2))

    // Non-vacuity: the protected state genuinely exists and is active before the call.
    expect(await readDeletedAt(sessionId)).toBeNull()

    // Call endDiscovery as student A (user client → real RLS WITH CHECK).
    await signInAs(emailA, password)
    const result = await endDiscovery()
    expect(result.success).toBe(true)

    // The student's own discovery row is now soft-deleted — the RLS WITH CHECK
    // permitted a student to set deleted_at on their own quiz_sessions row.
    expect(await readDeletedAt(sessionId)).not.toBeNull()
  })

  it('returns success as a no-op when the student has no active discovery session', async () => {
    // Student B has never started a discovery session.
    await signInAs(emailB, password)
    const result = await endDiscovery()
    expect(result.success).toBe(true)
  })

  it("does not touch another student's active discovery session", async () => {
    // Seed a real discovery row for student A.
    const studentAClient = await getAuthenticatedClient({ email: emailA, password })
    const sessionId = await seedDiscoverySession(studentAClient, questionIds.slice(0, 1))
    // Non-vacuity: student A's discovery row exists and is active.
    expect(await readDeletedAt(sessionId)).toBeNull()

    // Student B calls endDiscovery — it is student-scoped (eq student_id = uid),
    // so it must not soft-delete student A's row.
    await signInAs(emailB, password)
    const result = await endDiscovery()
    expect(result.success).toBe(true)

    // Student A's discovery row is untouched (still active).
    expect(await readDeletedAt(sessionId)).toBeNull()
  })
})
