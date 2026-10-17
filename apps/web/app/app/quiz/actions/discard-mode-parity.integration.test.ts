// App-layer integration tier — students_update_sessions mode exclusion vs the TS discard guard.
//
// A student's direct soft-delete of their own active quiz_sessions row must be refused by RLS
// for exactly the modes the app's discard guard blocks, and permitted for every other mode.
// Modes are derived from MODE_LABELS so a newly added mode is covered automatically.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MODE_LABELS } from '@/lib/constants/exam-modes'
import {
  cleanupTestData,
  clearActiveSessions,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
} from '@/lib/integration-support/harness'
import { discardBlockedError } from './_discard-guard'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-discard-parity-${suffix}@test.local`
const password = 'test-pass-123'

const modes = Object.keys(MODE_LABELS)
const blockedModes = modes.filter((m) => discardBlockedError(m) !== null)
const allowedModes = modes.filter((m) => discardBlockedError(m) === null)

let orgId: string
let studentId: string
let client: Awaited<ReturnType<typeof getAuthenticatedClient>>

async function seedActiveSession(mode: string): Promise<string> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: studentId,
      mode,
      total_questions: 1,
      time_limit_seconds: mode === 'quick_quiz' || mode === 'smart_review' ? null : 3600,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedActiveSession(${mode}): ${error.message}`)
  return (data as { id: string }).id
}

async function readDeletedAt(sessionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('deleted_at')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`readDeletedAt(${sessionId}): ${error.message}`)
  return (data as { deleted_at: string | null }).deleted_at
}

describe('student direct soft-delete of an active session (mode parity)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-discard-parity ${suffix}`,
      slug: `int-discard-parity-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    client = await getAuthenticatedClient({ email, password })
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await clearActiveSessions({ admin, studentIds: [studentId] })
    } catch (e) {
      errors.push(`clearActiveSessions: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      await cleanupTestData({ admin, orgId, userIds: [studentId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('covers both a refused and a permitted mode', () => {
    expect(blockedModes.length).toBeGreaterThan(0)
    expect(allowedModes.length).toBeGreaterThan(0)
    expect([...blockedModes].sort()).toEqual(['internal_exam', 'vfr_rt_exam'])
  })

  it.each(modes)(
    'applies the same discard rule to a student soft-deleting their own active %s session',
    async (mode) => {
      await clearActiveSessions({ admin, studentIds: [studentId] })
      const sessionId = await seedActiveSession(mode)
      // Non-vacuity: the protected row exists and is active before the student acts.
      expect(await readDeletedAt(sessionId)).toBeNull()

      const { data, error } = await client
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select('id')
      expect(error).toBeNull()

      if (discardBlockedError(mode) !== null) {
        expect(data).toHaveLength(0)
        expect(await readDeletedAt(sessionId)).toBeNull()
      } else {
        expect(data).toHaveLength(1)
        expect(await readDeletedAt(sessionId)).not.toBeNull()
      }
    },
  )
})
