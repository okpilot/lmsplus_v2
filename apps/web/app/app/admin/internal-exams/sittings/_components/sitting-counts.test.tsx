import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SittingCounts } from './sitting-counts'

describe('SittingCounts', () => {
  it('uses singular forms for a count of 1', () => {
    render(<SittingCounts summary={{ candidates: 1, entries: 1, codesIssued: 1 }} />)
    expect(screen.getByText('1 person · 1 exam · 1 code issued')).toBeTruthy()
  })

  it('uses plural forms otherwise, including zero', () => {
    render(<SittingCounts summary={{ candidates: 3, entries: 0, codesIssued: 2 }} />)
    expect(screen.getByText('3 people · 0 exams · 2 codes issued')).toBeTruthy()
  })
})
