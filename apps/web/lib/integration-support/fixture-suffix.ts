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
 * rows; the random half carries the entropy. Not a guarantee: 8 hex chars is
 * 2^32 values, so at the ~50 draws a full run makes, the collision probability
 * is about 3e-7 per run.
 */
export function fixtureSuffix(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`
}
