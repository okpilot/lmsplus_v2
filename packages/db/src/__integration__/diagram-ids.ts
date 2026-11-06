// Derived diagram ids for packages/db fixtures (#1215). Mirrors apps/web/scripts/diagram-content.ts
// `deriveLabelId` / `deriveZoneId` and the SQL in is_valid_diagram_config
// (migration 20261106000100_diagram_config_derived_ids.sql). Same scheme as ordering-item-id.ts.
import { orderingItemId } from './ordering-item-id'

/** Label id: `'l1' || substr(ordering_item_id(text), 3)`. */
export function diagramLabelId(text: string): string {
  return `l1${orderingItemId(text).slice(2)}`
}

/** Zone id: `'z1' || substr(ordering_item_id(image_ref || ' ' || index), 3)`; equals deriveZoneId for any non-blank imageRef. */
export function diagramZoneId(imageRef: string, index: number): string {
  return `z1${orderingItemId(`${imageRef} ${index}`).slice(2)}`
}
