import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VfrRtSavedPlaceholder } from './vfr-rt-saved-placeholder'

describe('VfrRtSavedPlaceholder', () => {
  it('shows a coming-soon message for saved practice sessions', () => {
    render(<VfrRtSavedPlaceholder />)
    expect(screen.getByText(/saved practice sessions are coming soon/i)).toBeInTheDocument()
  })
})
