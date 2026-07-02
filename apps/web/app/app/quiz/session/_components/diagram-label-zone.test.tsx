import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiagramLabelZone } from './diagram-label-zone'

const ZONE = { id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.4 }

describe('DiagramLabelZone', () => {
  it('shows the "Drop" placeholder when no label is placed', () => {
    render(<DiagramLabelZone zone={ZONE} placedLabel={null} disabled={false} />)
    expect(screen.getByText('Drop')).toBeInTheDocument()
  })

  it('renders the placed chip instead of the placeholder once a label is placed', () => {
    render(
      <DiagramLabelZone zone={ZONE} placedLabel={{ id: 'l1', text: 'Upwind' }} disabled={false} />,
    )
    expect(screen.queryByText('Drop')).not.toBeInTheDocument()
    expect(screen.getByTestId('diagram-label-chip-l1')).toHaveTextContent('Upwind')
  })

  it('carries the zone data-result attribute matching the graded result', () => {
    render(
      <DiagramLabelZone
        zone={ZONE}
        placedLabel={{ id: 'l1', text: 'Upwind' }}
        disabled={true}
        result="correct"
      />,
    )
    expect(screen.getByTestId('diagram-label-zone-z1')).toHaveAttribute('data-result', 'correct')
  })

  it('reveals the canonical label text when the zone is graded incorrect', () => {
    render(
      <DiagramLabelZone
        zone={ZONE}
        placedLabel={{ id: 'l1', text: 'Upwind' }}
        disabled={true}
        result="incorrect"
        canonicalText="Downwind"
      />,
    )
    expect(screen.getByTestId('diagram-label-canonical-z1')).toHaveTextContent('Downwind')
  })

  it('does not reveal canonical text when the zone is graded correct', () => {
    render(
      <DiagramLabelZone
        zone={ZONE}
        placedLabel={{ id: 'l1', text: 'Upwind' }}
        disabled={true}
        result="correct"
        canonicalText="Upwind"
      />,
    )
    expect(screen.queryByTestId('diagram-label-canonical-z1')).not.toBeInTheDocument()
  })

  it('does not reveal canonical text before grading, even if canonicalText is somehow provided', () => {
    render(
      <DiagramLabelZone
        zone={ZONE}
        placedLabel={{ id: 'l1', text: 'Upwind' }}
        disabled={false}
        canonicalText="Downwind"
      />,
    )
    expect(screen.queryByTestId('diagram-label-canonical-z1')).not.toBeInTheDocument()
  })
})
