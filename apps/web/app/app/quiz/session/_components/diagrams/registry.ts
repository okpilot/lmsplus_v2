// Registry mapping a question's `diagram_config.image_ref` (a logical, public
// key — never a file path or URL) to the pure SVG artwork component that
// renders it. Add one entry per new `diagram_label` diagram; never a barrel
// re-export of the components themselves — import the component directly
// from its own file wherever it's used outside the registry.

import type React from 'react'
import { RWY_2709_IMAGE_REF } from './rwy-2709-layout'
import { RwyPattern2709Lh } from './rwy-2709-lh-pattern'

export const DIAGRAM_COMPONENTS: Record<string, React.ComponentType> = {
  [RWY_2709_IMAGE_REF]: RwyPattern2709Lh,
}

/** Resolves an `image_ref` to its artwork component, or null if unknown (fail
 *  closed — an unrecognized ref renders no artwork rather than throwing). */
export function getDiagramComponent(imageRef: string): React.ComponentType | null {
  return DIAGRAM_COMPONENTS[imageRef] ?? null
}
