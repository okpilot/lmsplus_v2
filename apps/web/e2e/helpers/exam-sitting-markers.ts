import { randomUUID } from 'node:crypto'

/** Marker prefix on `exam_sittings.permitted_materials` written by `markE2eSitting`, `seedSitting` and the red-team helpers. */
export const EXAM_SITTING_E2E_PREFIX = 'E2E-SIT-'

/** Unique marked `permitted_materials` value (<= 1000 chars). */
export function makeSittingE2eMaterials(): string {
  return `${EXAM_SITTING_E2E_PREFIX}${randomUUID()}`
}

/** `permitted_materials` prefix of sittings built by `seedSitting`: the cleanup removes them with their people. */
export const EXAM_SITTING_SEED_PREFIX = `${EXAM_SITTING_E2E_PREFIX}SEED-`

/** Email domain of the users `seedSitting` creates; every address starts with `e2e-sit-`. */
export const EXAM_SITTING_SEED_EMAIL_PREFIX = 'e2e-sit-'

/** `student_groups.name` prefix of groups built by `seedSitting`: the cleanup hard-deletes them with their members. */
export const EXAM_SITTING_SEED_GROUP_PREFIX = 'E2E-GRP-SIT-'

/** Unique `permitted_materials` value of a sitting made through the UI that the seeded cleanup removes with its people and codes. */
export function makeSittingSeedMaterials(): string {
  return `${EXAM_SITTING_SEED_PREFIX}${randomUUID()}`
}
