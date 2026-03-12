import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatisticsTab } from './statistics-tab'

describe('StatisticsTab', () => {
  it('prompts to answer first when hasAnswered is false', () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={false} />)
    expect(screen.getByText('Answer the question to see your statistics.')).toBeInTheDocument()
  })

  it('shows placeholder when hasAnswered is true', () => {
    render(<StatisticsTab questionId="q-1" hasAnswered={true} />)
    expect(screen.getByText('Statistics will be available soon.')).toBeInTheDocument()
  })
})
