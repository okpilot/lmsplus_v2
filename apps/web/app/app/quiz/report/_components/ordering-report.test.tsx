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
