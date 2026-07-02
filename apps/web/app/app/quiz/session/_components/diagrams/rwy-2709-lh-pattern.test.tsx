import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RwyPattern2709Lh } from './rwy-2709-lh-pattern'

describe('RwyPattern2709Lh', () => {
  it('renders an accessible SVG schematic with a landscape 16:9 viewBox', () => {
    const { container } = render(<RwyPattern2709Lh />)
    expect(
      screen.getByRole('img', { name: /rwy 27\/09 left-hand traffic pattern/i }),
    ).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 160 90')
  })

  it('draws a turn marker at each of the 4 circuit corners', () => {
    const { container } = render(<RwyPattern2709Lh />)
    expect(container.querySelectorAll('circle')).toHaveLength(4)
  })

  it('draws a direction arrow for each of the 5 legs', () => {
    const { container } = render(<RwyPattern2709Lh />)
    expect(container.querySelectorAll('polygon')).toHaveLength(5)
  })

  it('draws the runway surface with a centerline and threshold markings', () => {
    const { container } = render(<RwyPattern2709Lh />)
    // main runway surface + 2 thresholds x 4 piano-key stripes each
    expect(container.querySelectorAll('rect')).toHaveLength(9)
    expect(container.querySelectorAll('line')).toHaveLength(1)
  })
})
