import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionFilterValue } from '../types'
import { QuestionFilters } from './question-filters'

describe('QuestionFilters', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders all 4 filter pills', () => {
    render(<QuestionFilters value={['all']} onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'All questions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unseen only' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Incorrectly answered' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Flagged' })).toBeInTheDocument()
  })

  it('"All questions" pill is active when value is [\'all\']', () => {
    render(<QuestionFilters value={['all']} onValueChange={vi.fn()} />)
    // Active pills have border-primary class; inactive do not
    const allBtn = screen.getByRole('button', { name: 'All questions' })
    expect(allBtn.className).toContain('border-primary')
    expect(allBtn.className).toContain('text-primary')
  })

  it('marks the correct pill as active when a specific filter is set', () => {
    render(<QuestionFilters value={['unseen']} onValueChange={vi.fn()} />)
    const unseenBtn = screen.getByRole('button', { name: 'Unseen only' })
    expect(unseenBtn.className).toContain('border-primary')
    const allBtn = screen.getByRole('button', { name: 'All questions' })
    expect(allBtn.className).not.toContain('border-primary')
  })

  it('clicking a specific filter calls onValueChange without "all"', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['all']} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'Unseen only' }))
    expect(onValueChange).toHaveBeenCalledWith(['unseen'])
  })

  it('clicking "All questions" calls onValueChange with [\'all\']', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['unseen']} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'All questions' }))
    expect(onValueChange).toHaveBeenCalledWith(['all'])
  })

  it("toggling off the only active specific filter reverts to ['all']", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['unseen']} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'Unseen only' }))
    expect(onValueChange).toHaveBeenCalledWith(['all'])
  })

  it('multiple specific filters can be active simultaneously', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    // Start with unseen already selected, add incorrect
    render(<QuestionFilters value={['unseen']} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'Incorrectly answered' }))
    const called = onValueChange.mock.calls[0]![0] as QuestionFilterValue[]
    expect(called).toContain('unseen')
    expect(called).toContain('incorrect')
    expect(called).not.toContain('all')
  })

  it('removing one filter from a multi-selection leaves the other active', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['unseen', 'incorrect']} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'Unseen only' }))
    expect(onValueChange).toHaveBeenCalledWith(['incorrect'])
  })

  it('marks multiple pills as active when multiple filters are selected', () => {
    render(<QuestionFilters value={['unseen', 'flagged']} onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Unseen only' }).className).toContain(
      'border-primary',
    )
    expect(screen.getByRole('button', { name: 'Flagged' }).className).toContain('border-primary')
    expect(screen.getByRole('button', { name: 'All questions' }).className).not.toContain(
      'border-primary',
    )
  })
})
