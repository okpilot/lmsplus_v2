import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiagramLabelPool } from './diagram-label-pool'

const LABELS = [
  { id: 'l1', text: 'Upwind' },
  { id: 'l2', text: 'Downwind' },
]

describe('DiagramLabelPool', () => {
  it('renders a chip per delivered label', () => {
    render(<DiagramLabelPool labels={LABELS} disabled={false} />)
    expect(screen.getByTestId('diagram-label-chip-l1')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-label-chip-l2')).toBeInTheDocument()
  })

  it('shows an "All labels placed" message when the pool is empty', () => {
    render(<DiagramLabelPool labels={[]} disabled={false} />)
    expect(screen.getByText('All labels placed')).toBeInTheDocument()
  })

  it('does not show the empty-pool message while chips remain', () => {
    render(<DiagramLabelPool labels={LABELS} disabled={false} />)
    expect(screen.queryByText('All labels placed')).not.toBeInTheDocument()
  })

  it('disables every chip when the pool itself is disabled', () => {
    render(<DiagramLabelPool labels={LABELS} disabled={true} />)
    expect(screen.getByTestId('diagram-label-chip-l1')).toBeDisabled()
    expect(screen.getByTestId('diagram-label-chip-l2')).toBeDisabled()
  })
})
