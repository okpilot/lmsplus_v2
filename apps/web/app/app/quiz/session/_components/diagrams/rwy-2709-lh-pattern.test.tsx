import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RwyPattern2709Lh } from './rwy-2709-lh-pattern'

describe('RwyPattern2709Lh', () => {
  it('renders an accessible SVG schematic labelled with both runway thresholds', () => {
    render(<RwyPattern2709Lh />)
    expect(
      screen.getByRole('img', { name: /rwy 27\/09 left-hand traffic pattern/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('09')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
  })

  it('draws a turn marker at each of the 4 circuit corners', () => {
    const { container } = render(<RwyPattern2709Lh />)
    expect(container.querySelectorAll('circle')).toHaveLength(4)
  })

  it('draws a direction arrow for each of the 5 legs', () => {
    const { container } = render(<RwyPattern2709Lh />)
    expect(container.querySelectorAll('polygon')).toHaveLength(5)
  })
})
