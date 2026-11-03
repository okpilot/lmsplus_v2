import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Slider } from './slider'

describe('Slider', () => {
  it('thumb carries no disabled opacity or pointer-events classes', () => {
    const { container } = render(<Slider defaultValue={[50]} disabled />)
    const thumbs = container.querySelectorAll('[data-slot="slider-thumb"]')
    expect(thumbs.length).toBeGreaterThan(0)
    for (const t of thumbs) {
      expect(t.className).not.toMatch(/disabled:opacity-/)
      expect(t.className).not.toMatch(/disabled:pointer-events-none/)
    }
  })
})
