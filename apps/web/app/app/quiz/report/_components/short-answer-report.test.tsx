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
})
