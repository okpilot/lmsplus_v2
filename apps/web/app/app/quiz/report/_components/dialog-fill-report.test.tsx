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
