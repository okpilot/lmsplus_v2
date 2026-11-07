// App-layer integration tier — closePracticeSessionForDraft mode allowlist.
//
// The helper soft-deletes a draft's session through the student's own RLS client, so it may
// park a practice session but must NEVER park a graded exam. RLS (students_update_sessions)
// already refuses internal_exam / vfr_rt_exam; mock_exam is protected only by the helper's
// `.in('mode', PRACTICE_MODES)` filter, so it is the case that pins the allowlist.
import { createServerSupabaseClient } from '@repo/db/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EXAM_MODES, isExamMode, PRACTICE_MODES } from '@/lib/constants/exam-modes'
import {
  cleanupTestData,
  clearActiveSessions,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { closePracticeSessionForDraft } from './draft-helpers'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-draft-helpers-${suffix}@test.local`
const password = 'test-pass-123'

// Sentinels: vitest runs afterAll after a failed beforeAll.
let orgId = ''
let studentId = ''

async function seedActiveSession(mode: string): Promise<string> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: studentId,
      mode,
      total_questions: 1,
      time_limit_seconds: isExamMode(mode) ? 3600 : null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedActiveSession(${mode}): ${error.message}`)
  expect(data).not.toBeNull()
  return (data as { id: string }).id
}

async function readDeletedAt(sessionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('deleted_at')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`readDeletedAt(${sessionId}): ${error.message}`)
  expect(data).not.toBeNull()
  return (data as { deleted_at: string | null }).deleted_at
}

describe('closePracticeSessionForDraft (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-draft-helpers ${suffix}`,
      slug: `int-draft-helpers-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
  })

  beforeEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentId] })
    await signInAs(email, password)
  })

  afterAll(async () => {
    if (!orgId) return
    const errors: string[] = []
    try {
      if (studentId) await clearActiveSessions({ admin, studentIds: [studentId] })
    } catch (e) {
      errors.push(`clearActiveSessions: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      await cleanupTestData({ admin, orgId, userIds: studentId ? [studentId] : [] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it.each(PRACTICE_MODES)('soft-deletes the active %s session', async (mode) => {
    const sessionId = await seedActiveSession(mode)
    // Non-vacuity: the row is active before the helper runs.
    expect(await readDeletedAt(sessionId)).toBeNull()

    await closePracticeSessionForDraft(await createServerSupabaseClient(), sessionId, studentId)

    expect(await readDeletedAt(sessionId)).not.toBeNull()
  })

  it.each(EXAM_MODES)('leaves the active %s session untouched', async (mode) => {
    const sessionId = await seedActiveSession(mode)
    expect(await readDeletedAt(sessionId)).toBeNull()

    await closePracticeSessionForDraft(await createServerSupabaseClient(), sessionId, studentId)

    expect(await readDeletedAt(sessionId)).toBeNull()
  })
})
