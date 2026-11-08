// App-layer integration tier — closePracticeSessionForDraft parks practice sessions only.
import { createServerSupabaseClient } from '@repo/db/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isExamMode, MODE_LABELS, PRACTICE_MODES } from '@/lib/constants/exam-modes'
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
const PROTECTED_MODES = Object.keys(MODE_LABELS).filter(
  (m) => !(PRACTICE_MODES as readonly string[]).includes(m),
)

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
  return data.id
}

async function readDeletedAt(sessionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('deleted_at')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`readDeletedAt(${sessionId}): ${error.message}`)
  return data.deleted_at
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

  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    errorSpy = vi.spyOn(console, 'error')
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
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('pins the protected mode set', () => {
    // a new mode needs a practice-vs-protected decision
    expect([...PROTECTED_MODES].sort()).toEqual([
      'discovery',
      'internal_exam',
      'mock_exam',
      'vfr_rt_exam',
    ])
  })

  it.each(PROTECTED_MODES)('leaves the active %s session untouched', async (mode) => {
    const sessionId = await seedActiveSession(mode)
    expect(await readDeletedAt(sessionId)).toBeNull()

    await closePracticeSessionForDraft(await createServerSupabaseClient(), sessionId, studentId)

    expect(await readDeletedAt(sessionId)).toBeNull()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
