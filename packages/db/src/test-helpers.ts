// Public test-helper surface for the app-layer integration tier (#925).
//
// Re-exports the service-role seed/cleanup utilities that both the packages/db
// integration tests and the apps/web app-layer integration tier share. These
// modules import ONLY `@supabase/supabase-js` (never `vitest`), so this entry
// point is import-safe — it pulls no test framework into any runtime graph.
//
// This is NOT a barrel over feature code (code-style.md §4) — it is a single,
// intentional test-only aggregation point, mirroring how `@repo/db/server`
// exposes one concern per export path.

export { cleanupReferenceData, cleanupTestData, type ReferenceIds } from './__integration__/cleanup'
export { seedQuestions, seedReferenceData } from './__integration__/seed'
export {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './__integration__/setup'
