// Derived diagram ids for packages/db fixtures (#1215). Mirrors apps/web/scripts/diagram-content.ts
// `deriveLabelId` / `deriveZoneId` and the SQL in is_valid_diagram_config
// (migration 20261106000100_diagram_config_derived_ids.sql). Same scheme as ordering-item-id.ts.
import { createHash } from 'node:crypto'

/** Must match apps/web/scripts/content-ids.ts `normalizeForId` exactly. */
function normalizeForId(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

function derive(prefix: string, parts: readonly string[]): string {
  const canonical = parts.map(normalizeForId).join(' ')
  return `${prefix}1${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 8)}`
}

/** Label id: derived from the label's own text. */
export function diagramLabelId(text: string): string {
  return derive('l', [text])
}

/** Zone id: derived from (image_ref, canonical zone index). */
export function diagramZoneId(imageRef: string, index: number): string {
  return derive('z', [imageRef, String(index)])
}
