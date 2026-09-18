// Fixture-namespace generator for the packages/db integration tier.
//
// Its own module, deliberately: setup.ts resolves service-role env at module scope, so a helper
// living there could not be unit tested without a database.
import { randomUUID } from 'node:crypto'

/**
 * Collision-resistant namespace for one test file's fixtures.
 *
 * vitest.integration.config.ts runs test FILES in parallel processes against ONE shared Postgres,
 * so a namespace derived from a millisecond clock collides whenever two files initialise in the
 * same millisecond behind the same literal prefix. That collision is silent, not a duplicate-key
 * error: seedReferenceData upserts on `code`, so both processes receive the SAME subject id and
 * each afterAll's cleanupReferenceData then deletes it out from under the other.
 *
 * The timestamp half is for chronological readability when debugging leftover rows; the random
 * half carries the entropy: 8 hex chars, 2^32 values. Improbable is not impossible. One draw per
 * test file, a count that moves as files are added, so derive it rather than restating it here:
 *   grep -rl 'fixtureSuffix()' packages/db/src/__integration__ --include='*.ts' | wc -l
 */
export function fixtureSuffix(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`
}
