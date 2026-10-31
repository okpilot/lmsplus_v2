import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DialogFillBlankResult } from '@/lib/queries/quiz-report'
import { DialogFillReport } from './dialog-fill-report'

const partialBlanks: DialogFillBlankResult[] = [
  { index: 0, responseText: 'cleared', canonical: 'cleared', isCorrect: true },
  { index: 1, responseText: 'descend', canonical: 'climb', isCorrect: false },
]

describe('DialogFillReport', () => {
  it('leads with the fraction of correct blanks', () => {
    render(<DialogFillReport blanks={partialBlanks} correctCount={1} totalBlanks={2} />)
    expect(screen.getByText('1 / 2 blanks correct')).toBeInTheDocument()
  })

  it('lists each blank response with a 1-based label', () => {
    render(<DialogFillReport blanks={partialBlanks} correctCount={1} totalBlanks={2} />)
    expect(screen.getByText('Blank 1:')).toBeInTheDocument()
    expect(screen.getByText('Blank 2:')).toBeInTheDocument()
  })

  it('shows the expected value for an incorrect blank', () => {
    render(<DialogFillReport blanks={partialBlanks} correctCount={1} totalBlanks={2} />)
    expect(screen.getByText('(expected: climb)')).toBeInTheDocument()
  })

  it('shows a full fraction when every blank is correct', () => {
    const allCorrect: DialogFillBlankResult[] = [
      { index: 0, responseText: 'cleared', canonical: 'cleared', isCorrect: true },
      { index: 1, responseText: 'climb', canonical: 'climb', isCorrect: true },
    ]
    render(<DialogFillReport blanks={allCorrect} correctCount={2} totalBlanks={2} />)
    expect(screen.getByText('2 / 2 blanks correct')).toBeInTheDocument()
  })

  it('shows a zero fraction when no blanks are correct', () => {
    const noneCorrect: DialogFillBlankResult[] = [
      { index: 0, responseText: 'wrong', canonical: 'cleared', isCorrect: false },
    ]
    render(<DialogFillReport blanks={noneCorrect} correctCount={0} totalBlanks={1} />)
    expect(screen.getByText('0 / 1 blank correct')).toBeInTheDocument()
  })

  it('shows a placeholder when a blank was left empty', () => {
    const emptyBlank: DialogFillBlankResult[] = [
      { index: 0, responseText: null, canonical: 'cleared', isCorrect: false },
    ]
    render(<DialogFillReport blanks={emptyBlank} correctCount={0} totalBlanks={1} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('announces each blank result to screen readers', () => {
    render(<DialogFillReport blanks={partialBlanks} correctCount={1} totalBlanks={2} />)
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })
})

describe('DialogFillReport fraction tone and palette', () => {
  it('colours the fraction line success when all are correct', () => {
    render(
      <DialogFillReport
        blanks={[partialBlanks[0]!, { ...partialBlanks[1]!, isCorrect: true }]}
        correctCount={2}
        totalBlanks={2}
      />,
    )
    expect(screen.getByText(/blanks? correct/).className).toContain('text-success')
  })

  it('colours the fraction line danger when none are correct', () => {
    render(
      <DialogFillReport
        blanks={[{ ...partialBlanks[0]!, isCorrect: false }]}
        correctCount={0}
        totalBlanks={1}
      />,
    )
    expect(screen.getByText(/blanks? correct/).className).toContain('text-danger')
  })

  it('shows the fraction line grey with an amber aria-hidden ring icon when partial', () => {
    const { container } = render(
      <DialogFillReport blanks={partialBlanks} correctCount={1} totalBlanks={2} />,
    )
    const line = screen.getByText(/blanks? correct/)
    expect(line.className).toContain('text-muted-foreground')
    const icon = container.querySelector('svg.text-caution')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('uses success for correct and danger for wrong items, no legacy palette', () => {
    const { container } = render(
      <DialogFillReport blanks={partialBlanks} correctCount={1} totalBlanks={2} />,
    )
    expect(container.innerHTML).toContain('text-success')
    expect(container.innerHTML).toContain('text-danger')
    expect(container.innerHTML).not.toMatch(/text-green-600|text-amber-600|text-destructive/)
  })
})
