import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OrderingSlotResult } from '@/lib/queries/quiz-report'
import { OrderingReport } from './ordering-report'

const partialSlots: OrderingSlotResult[] = [
  { position: 0, responseText: 'mayday', canonicalText: 'mayday', isCorrect: true },
  { position: 1, responseText: 'callsign', canonicalText: 'position', isCorrect: false },
]

describe('OrderingReport', () => {
  it('leads with the fraction of correct positions', () => {
    render(<OrderingReport slots={partialSlots} correctCount={1} totalItems={2} />)
    expect(screen.getByText('1 / 2 positions correct')).toBeInTheDocument()
  })

  it('lists each placed item with a 1-based position label', () => {
    render(<OrderingReport slots={partialSlots} correctCount={1} totalItems={2} />)
    expect(screen.getByText('Position 1:')).toBeInTheDocument()
    expect(screen.getByText('Position 2:')).toBeInTheDocument()
  })

  it('shows the canonical item for a wrongly-placed position', () => {
    render(<OrderingReport slots={partialSlots} correctCount={1} totalItems={2} />)
    expect(screen.getByText('(expected: position)')).toBeInTheDocument()
  })

  it('shows a full fraction when every position is correct', () => {
    const allCorrect: OrderingSlotResult[] = [
      { position: 0, responseText: 'mayday', canonicalText: 'mayday', isCorrect: true },
      { position: 1, responseText: 'position', canonicalText: 'position', isCorrect: true },
    ]
    render(<OrderingReport slots={allCorrect} correctCount={2} totalItems={2} />)
    expect(screen.getByText('2 / 2 positions correct')).toBeInTheDocument()
  })

  it('shows a zero fraction when no positions are correct', () => {
    const noneCorrect: OrderingSlotResult[] = [
      { position: 0, responseText: 'wrong', canonicalText: 'mayday', isCorrect: false },
    ]
    render(<OrderingReport slots={noneCorrect} correctCount={0} totalItems={1} />)
    expect(screen.getByText('0 / 1 position correct')).toBeInTheDocument()
  })

  it('shows a placeholder when a slot was left empty', () => {
    const emptySlot: OrderingSlotResult[] = [
      { position: 0, responseText: null, canonicalText: 'mayday', isCorrect: false },
    ]
    render(<OrderingReport slots={emptySlot} correctCount={0} totalItems={1} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('announces each position result to screen readers', () => {
    render(<OrderingReport slots={partialSlots} correctCount={1} totalItems={2} />)
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })
})

describe('OrderingReport fraction tone and palette', () => {
  it('colours the fraction line success when all are correct', () => {
    render(
      <OrderingReport
        slots={[partialSlots[0]!, { ...partialSlots[1]!, isCorrect: true }]}
        correctCount={2}
        totalItems={2}
      />,
    )
    expect(screen.getByText(/positions? correct/).className).toContain('text-success')
  })

  it('colours the fraction line danger when none are correct', () => {
    render(
      <OrderingReport
        slots={[{ ...partialSlots[0]!, isCorrect: false }]}
        correctCount={0}
        totalItems={1}
      />,
    )
    expect(screen.getByText(/positions? correct/).className).toContain('text-danger')
  })

  it('shows the fraction line grey with an amber aria-hidden ring icon when partial', () => {
    const { container } = render(
      <OrderingReport slots={partialSlots} correctCount={1} totalItems={2} />,
    )
    const line = screen.getByText(/positions? correct/)
    expect(line.className).toContain('text-muted-foreground')
    const icon = container.querySelector('svg.text-caution')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('uses success for correct and danger for wrong items, no legacy palette', () => {
    const { container } = render(
      <OrderingReport slots={partialSlots} correctCount={1} totalItems={2} />,
    )
    expect(container.innerHTML).toContain('text-success')
    expect(container.innerHTML).toContain('text-danger')
    expect(container.innerHTML).not.toMatch(/text-green-600|text-amber-600|text-destructive/)
  })
})
