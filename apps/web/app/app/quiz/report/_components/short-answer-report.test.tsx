import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShortAnswerReport } from './short-answer-report'

describe('ShortAnswerReport', () => {
  it('shows the student response when the answer is correct', () => {
    render(
      <ShortAnswerReport
        responseText="cleared for takeoff"
        canonicalAnswer="cleared for takeoff"
        isCorrect
      />,
    )
    expect(screen.getByText('cleared for takeoff')).toBeInTheDocument()
  })

  it('does not show the expected answer when the response is correct', () => {
    render(
      <ShortAnswerReport
        responseText="cleared for takeoff"
        canonicalAnswer="cleared for takeoff"
        isCorrect
      />,
    )
    expect(screen.queryByText('Expected:')).not.toBeInTheDocument()
  })

  it('shows the expected answer alongside the response when the answer is wrong', () => {
    render(
      <ShortAnswerReport
        responseText="cleared to land"
        canonicalAnswer="cleared for takeoff"
        isCorrect={false}
      />,
    )
    expect(screen.getByText('cleared to land')).toBeInTheDocument()
    expect(screen.getByText('Expected:')).toBeInTheDocument()
    expect(screen.getByText('cleared for takeoff')).toBeInTheDocument()
  })

  it('shows a placeholder when the student left the answer blank', () => {
    render(<ShortAnswerReport responseText={null} canonicalAnswer="anything" isCorrect={false} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('does not show the expected row when the answer is wrong but no canonical is available', () => {
    render(
      <ShortAnswerReport responseText="wrong answer" canonicalAnswer={null} isCorrect={false} />,
    )
    expect(screen.queryByText('Expected:')).not.toBeInTheDocument()
  })
})

describe('ShortAnswerReport palette', () => {
  it('uses success for a correct response, no legacy palette', () => {
    const { container } = render(
      <ShortAnswerReport responseText="a" canonicalAnswer="a" isCorrect />,
    )
    expect(container.innerHTML).toContain('text-success')
    expect(container.innerHTML).not.toMatch(/text-green-600|text-amber-600|text-destructive/)
  })

  it('uses danger for a wrong response', () => {
    const { container } = render(
      <ShortAnswerReport responseText="b" canonicalAnswer="a" isCorrect={false} />,
    )
    expect(container.innerHTML).toContain('text-danger')
    expect(container.innerHTML).not.toMatch(/text-green-600|text-amber-600|text-destructive/)
  })
})
