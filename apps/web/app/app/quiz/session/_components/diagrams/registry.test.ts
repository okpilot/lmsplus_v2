import { describe, expect, it } from 'vitest'
import { DIAGRAM_COMPONENTS, getDiagramComponent } from './registry'
import { RWY_2709_IMAGE_REF } from './rwy-2709-layout'
import { RwyPattern2709Lh } from './rwy-2709-lh-pattern'

describe('getDiagramComponent', () => {
  it('resolves the RWY 27/09 image_ref to its artwork component', () => {
    expect(getDiagramComponent(RWY_2709_IMAGE_REF)).toBe(RwyPattern2709Lh)
  })

  it('returns null for an unknown image_ref (fail closed, no throw)', () => {
    expect(getDiagramComponent('not-a-real-diagram')).toBeNull()
  })
})

describe('DIAGRAM_COMPONENTS', () => {
  it('has exactly one entry keyed by RWY_2709_IMAGE_REF', () => {
    expect(Object.keys(DIAGRAM_COMPONENTS)).toEqual([RWY_2709_IMAGE_REF])
  })
})
