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

export {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
} from '@repo/db/test-helpers'

/**
 * Authenticates the in-memory cookie jar for the given user credentials.
 *
 * After this resolves, any `createServerSupabaseClient()` call runs as that user under real RLS.
 *
 * @throws If authentication fails or no session is created.
 */
export async function signInAs(email: string, password: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signInAs(${email}): ${error.message}`)
  // No error but no session would silently run the code-under-test as anon → confusing
  // RLS-empty failures downstream. Fail loud here instead.
  if (!data.session) throw new Error(`signInAs(${email}): no session created`)
}
