import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatmapHeader } from './heatmap-header'

const BASE_PROPS = {
  monthName: 'March',
  monthNameShort: 'Mar',
  year: 2026,
  isCurrentMonth: false,
  atMinOffset: false,
  onBack: vi.fn(),
  onForward: vi.fn(),
}

describe('HeatmapHeader', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the "Daily Progress" heading', () => {
    render(<HeatmapHeader {...BASE_PROPS} />)
    expect(screen.getByRole('heading', { name: 'Daily Progress' })).toBeInTheDocument()
  })

  it('renders the full month name and year', () => {
    render(<HeatmapHeader {...BASE_PROPS} />)
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })

  it('renders the short month name and year', () => {
    render(<HeatmapHeader {...BASE_PROPS} />)
    expect(screen.getByText('Mar 2026')).toBeInTheDocument()
  })

  it('calls onBack when the previous-month button is clicked', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<HeatmapHeader {...BASE_PROPS} onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('calls onForward when the next-month button is clicked', async () => {
    const user = userEvent.setup()
    const onForward = vi.fn()
    render(<HeatmapHeader {...BASE_PROPS} onForward={onForward} />)
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onForward).toHaveBeenCalledOnce()
  })

  it('disables the previous-month button when atMinOffset is true', () => {
    render(<HeatmapHeader {...BASE_PROPS} atMinOffset={true} />)
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })

  it('disables the next-month button when isCurrentMonth is true', () => {
    render(<HeatmapHeader {...BASE_PROPS} isCurrentMonth={true} />)
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
  })

  it('enables both buttons when not at limits', () => {
    render(<HeatmapHeader {...BASE_PROPS} atMinOffset={false} isCurrentMonth={false} />)
    expect(screen.getByRole('button', { name: 'Previous month' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).not.toBeDisabled()
  })
})
