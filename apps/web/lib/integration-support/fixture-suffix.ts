// Fixture-namespace generator for the app-layer integration tier.
//
// Its own module, deliberately: harness.ts imports @repo/db/test-helpers, which
// needs service-role env at import time, so a helper living there cannot be unit
// tested without a database. harness.ts re-exports this so call sites are unchanged.
import { randomUUID } from 'node:crypto'
/**
 * Collision-resistant namespace for one test file's fixtures.
 *
 * `pool: 'forks'` runs test FILES in parallel processes against ONE shared
 * Postgres, so a namespace derived from a millisecond clock collides whenever
 * two files initialise in the same millisecond. That collision is silent, not a
 * duplicate-key error: `seedReferenceData` upserts on `code`, so both processes
 * receive the SAME subject id and each `afterAll` then deletes it out from under
 * the other.
 *
 * The timestamp half is for chronological readability when debugging leftover
 * rows; the random half carries the entropy: 8 hex chars, 2^32 values. Improbable
 * is not impossible. One draw per test file, a count that moves as files are
 * added, so derive it rather than restating it here:
 *   grep -rl 'fixtureSuffix()' apps/web --include='*.integration.test.ts' | wc -l
 */
export function fixtureSuffix(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`
}
