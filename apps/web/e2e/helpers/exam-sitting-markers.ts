import { randomUUID } from 'node:crypto'

/** Marker prefix on `exam_sittings.permitted_materials` for rows created by sitting E2E specs. */
export const EXAM_SITTING_E2E_PREFIX = 'E2E-SIT-'

/** Unique marked `permitted_materials` value (<= 1000 chars). */
export function makeSittingE2eMaterials(): string {
  return `${EXAM_SITTING_E2E_PREFIX}${randomUUID()}`
}
