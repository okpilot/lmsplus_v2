import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiagramLabelChip } from './diagram-label-chip'

describe('DiagramLabelChip', () => {
  it('renders the chip text', () => {
    render(<DiagramLabelChip id="l1" text="Upwind" disabled={false} />)
    expect(screen.getByTestId('diagram-label-chip-l1')).toHaveTextContent('Upwind')
  })

  it('is disabled when the disabled prop is true', () => {
    render(<DiagramLabelChip id="l1" text="Upwind" disabled={true} />)
    expect(screen.getByTestId('diagram-label-chip-l1')).toBeDisabled()
  })

  it('is not disabled when the disabled prop is false', () => {
    render(<DiagramLabelChip id="l1" text="Upwind" disabled={false} />)
    expect(screen.getByTestId('diagram-label-chip-l1')).not.toBeDisabled()
  })

  it('carries no data-result attribute value before grading', () => {
    render(<DiagramLabelChip id="l1" text="Upwind" disabled={false} />)
    expect(screen.getByTestId('diagram-label-chip-l1')).toHaveAttribute('data-result', '')
  })

  it('carries a correct data-result attribute when graded correct', () => {
    render(<DiagramLabelChip id="l1" text="Upwind" disabled={true} result="correct" />)
    expect(screen.getByTestId('diagram-label-chip-l1')).toHaveAttribute('data-result', 'correct')
  })

  it('carries an incorrect data-result attribute when graded incorrect', () => {
    render(<DiagramLabelChip id="l1" text="Upwind" disabled={true} result="incorrect" />)
    expect(screen.getByTestId('diagram-label-chip-l1')).toHaveAttribute('data-result', 'incorrect')
  })
})
