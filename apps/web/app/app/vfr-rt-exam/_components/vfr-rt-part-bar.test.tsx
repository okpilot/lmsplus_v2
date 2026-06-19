import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VfrRtPartBar } from './vfr-rt-part-bar'

describe('VfrRtPartBar', () => {
  it('renders the label and percentage', () => {
    render(<VfrRtPartBar label="Part 1 — Short Answer" pct={80} passed={true} />)
    expect(screen.getByText('Part 1 — Short Answer')).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('sets aria-valuenow to pct', () => {
    render(<VfrRtPartBar label="Part 1" pct={74.9} passed={false} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '74.9')
  })

  it('shows PASS indicator and green styling when passed is true', () => {
    render(<VfrRtPartBar label="Part 1" pct={75} passed={true} />)
    expect(screen.getByText('PASS')).toBeInTheDocument()
    // The bar fill should have green class
    const bar = screen.getByRole('progressbar')
    expect(bar.className).toContain('bg-green-500')
  })

  it('shows FAIL indicator and red styling when passed is false', () => {
    render(<VfrRtPartBar label="Part 2" pct={74.9} passed={false} />)
    expect(screen.getByText('FAIL')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar.className).toContain('bg-red-500')
  })

  it('renders the 75% threshold marker', () => {
    render(<VfrRtPartBar label="Part 3" pct={80} passed={true} />)
    expect(screen.getByTestId('threshold-marker')).toBeInTheDocument()
  })

  it('clamps pct to 100 for the bar width', () => {
    render(<VfrRtPartBar label="Part 1" pct={120} passed={true} />)
    const bar = screen.getByRole('progressbar')
    // aria-valuenow reflects the clamped value
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(100)
  })
})
