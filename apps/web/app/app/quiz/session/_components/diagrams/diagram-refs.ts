// The complete set of logical `diagram_config.image_ref` keys this app knows
// how to render. Each ref is imported from the layout module that owns it, so
// the literal string is declared exactly once (in `rwy-2709-layout.ts`) and
// this list can never disagree with it.
//
// Add a ref here in the same change that adds its entry to `registry.ts` —
// `registry.test.ts` asserts the two carry the same members, so a diagram with
// artwork but no ref (or a ref with no artwork) fails there rather than
// rendering blank at runtime.

import { RWY_2709_IMAGE_REF } from './rwy-2709-layout'

export const DIAGRAM_IMAGE_REFS = [RWY_2709_IMAGE_REF] as const
