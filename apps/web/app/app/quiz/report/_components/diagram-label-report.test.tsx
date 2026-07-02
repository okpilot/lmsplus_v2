import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiagramZoneResult } from '@/lib/queries/quiz-report-diagram-types'
import { DiagramLabelReport } from './diagram-label-report'

const partialZones: DiagramZoneResult[] = [
  { blankIndex: 0, placedLabel: 'Upwind', correctLabel: 'Upwind', isCorrect: true },
  { blankIndex: 1, placedLabel: 'Downwind', correctLabel: 'Crosswind', isCorrect: false },
]

describe('DiagramLabelReport', () => {
  it('leads with the fraction of correct zones', () => {
    render(<DiagramLabelReport zones={partialZones} correctCount={1} totalZones={2} />)
    expect(screen.getByText('1 / 2 zones correct')).toBeInTheDocument()
  })

  it('lists each placed label with a 1-based zone label', () => {
    render(<DiagramLabelReport zones={partialZones} correctCount={1} totalZones={2} />)
    expect(screen.getByText('Zone 1:')).toBeInTheDocument()
    expect(screen.getByText('Zone 2:')).toBeInTheDocument()
  })

  it('shows the correct label for a wrongly-labeled zone', () => {
    render(<DiagramLabelReport zones={partialZones} correctCount={1} totalZones={2} />)
    expect(screen.getByText('(correct: Crosswind)')).toBeInTheDocument()
  })

  it('shows a full fraction when every zone is correct', () => {
    const allCorrect: DiagramZoneResult[] = [
      { blankIndex: 0, placedLabel: 'Upwind', correctLabel: 'Upwind', isCorrect: true },
      { blankIndex: 1, placedLabel: 'Crosswind', correctLabel: 'Crosswind', isCorrect: true },
    ]
    render(<DiagramLabelReport zones={allCorrect} correctCount={2} totalZones={2} />)
    expect(screen.getByText('2 / 2 zones correct')).toBeInTheDocument()
  })

  it('shows a zero fraction when no zones are correct', () => {
    const noneCorrect: DiagramZoneResult[] = [
      { blankIndex: 0, placedLabel: 'Downwind', correctLabel: 'Upwind', isCorrect: false },
    ]
    render(<DiagramLabelReport zones={noneCorrect} correctCount={0} totalZones={1} />)
    expect(screen.getByText('0 / 1 zone correct')).toBeInTheDocument()
  })

  it('shows a placeholder when a zone was left unplaced', () => {
    const emptyZone: DiagramZoneResult[] = [
      { blankIndex: 0, placedLabel: null, correctLabel: 'Upwind', isCorrect: false },
    ]
    render(<DiagramLabelReport zones={emptyZone} correctCount={0} totalZones={1} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('announces each zone result to screen readers', () => {
    render(<DiagramLabelReport zones={partialZones} correctCount={1} totalZones={2} />)
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })
})
