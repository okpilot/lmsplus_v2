// App-layer integration tier harness (#925).
//
// One import surface for integration tests: the `signInAs` helper (drives the
// real ssr client to seat a session in the cookie jar mocked by
// vitest.integration.setup.ts) plus the service-role seed/cleanup utilities
// shared with the packages/db tier (via the `@repo/db/test-helpers` export).
//
// NOT a barrel over feature code — it aggregates test-only utilities for the
// tier, the same way the DB tier centralizes its setup/seed/cleanup helpers.
import { createServerSupabaseClient } from '@repo/db/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
} from '@repo/db/test-helpers'

/**
 * Authenticate the in-memory cookie jar as the given user. After this resolves,
 * any `createServerSupabaseClient()` call in the code under test runs as that
 * user under real RLS. Relies on the `next/headers` mock in
 * vitest.integration.setup.ts (the jar is reset per-test there).
 *
 * Call this inside each test (or in `beforeEach`), NEVER in `beforeAll`: the
 * `beforeEach` in vitest.integration.setup.ts resets the cookie jar before every
 * test, so a session created in `beforeAll` is wiped before the first test runs —
 * the code under test would then execute as anon and fail with confusing
 * RLS-empty results.
 */
export async function signInAs(email: string, password: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signInAs(${email}): ${error.message}`)
  // No error but no session would silently run the code-under-test as anon → confusing
  // RLS-empty failures downstream. Fail loud here instead.
  if (!data.session) throw new Error(`signInAs(${email}): no session created`)
}

/**
 * Soft-delete every ACTIVE (not ended, not already deleted) quiz_sessions row
 * for the given students, via the service-role admin client. Call this in a
 * per-test hook (afterEach) for suites that start sessions directly (e.g.
 * start_exam_session): the single-active-session invariant (#1011,
 * uq_one_active_session_per_student) lets a session left active by one test
 * block the next test's start RPC with `another_session_active`.
 *
 * Zero rows is the normal case (no leftover); the `.select('id')` readback is
 * for observability only — log when something was actually cleared (code-style
 * §5). Returns the count of soft-deleted sessions.
 */
export async function clearActiveSessions(opts: {
  admin: SupabaseClient
  studentIds: string[]
  label?: string
}): Promise<number> {
  const { admin, studentIds, label } = opts
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .in('student_id', studentIds)
    .is('ended_at', null)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`clearActiveSessions: ${error.message}`)
  const count = data?.length ?? 0
  if (count > 0 && label) {
    console.info(`[${label}] cleared ${count} active session(s)`)
  }
  return count
}
