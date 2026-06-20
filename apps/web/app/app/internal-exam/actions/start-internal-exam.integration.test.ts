// App-layer integration tier (#925) — startInternalExam (negative paths only).
//
// The success path requires a minted internal_exam_codes row, which is DB-tier
// territory (the code is inserted by an admin RPC, not by a Server Action). Only
// the error-mapping and auth-guard branches are covered here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { startInternalExam } from './start-internal-exam'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
const emailA = `int-iexam-a-${suffix}@test.local`
const password = 'test-pass-123'

describe('startInternalExam (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-iexam ${suffix}`,
      slug: `int-iexam-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
    })
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentAId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('maps an unknown code to the unified invalid-or-expired message', async () => {
    await signInAs(emailA, password)

    // NOPE-<suffix> is guaranteed not to exist; the RPC raises 'code_not_found'
    // and _error-messages.ts maps it to the unified friendly string.
    const result = await startInternalExam({ code: `NOPE-${suffix}` })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid or expired code. Please contact your administrator.')
  })

  it('rejects malformed input', async () => {
    await signInAs(emailA, password)

    // StartInternalExamInput requires code: string min(1); an empty object fails parse.
    const result = await startInternalExam({})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset. The action's
    // own getUser() guard returns 'Not authenticated' here; the RPC's
    // not_authenticated token never fires because the action short-circuits first.
    const result = await startInternalExam({ code: `NOPE-${suffix}` })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
