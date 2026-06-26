import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalcMode, ImageMode } from '../types'
import { QuestionFilters } from './question-filters'

// Mock the Switch to a simple checkbox for testability. Forward aria-label so the
// calculation toggles can be targeted by accessible name.
vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    [key: string]: unknown
  }) => (
    <input
      type="checkbox"
      role="switch"
      aria-checked={checked}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...props}
    />
  ),
}))

function renderFilters(props: Partial<React.ComponentProps<typeof QuestionFilters>> = {}) {
  return render(
    <QuestionFilters
      value={props.value ?? ['all']}
      onValueChange={props.onValueChange ?? vi.fn()}
      calcMode={props.calcMode ?? 'all'}
      onCalcModeChange={props.onCalcModeChange ?? vi.fn()}
      imageMode={props.imageMode ?? 'all'}
      onImageModeChange={props.onImageModeChange ?? vi.fn()}
      unseenLabel={props.unseenLabel}
    />,
  )
}

describe('QuestionFilters', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders all 3 filter toggles', () => {
    renderFilters()
    expect(screen.getByText('Previously unseen')).toBeInTheDocument()
    expect(screen.getByText('Incorrectly answered')).toBeInTheDocument()
    expect(screen.getByText('Flagged questions')).toBeInTheDocument()
  })

  it('shows the unseenLabel override when provided as "Unseen"', () => {
    renderFilters({ unseenLabel: 'Unseen' })
    expect(screen.getByText('Unseen')).toBeInTheDocument()
    expect(screen.queryByText('Previously unseen')).not.toBeInTheDocument()
  })

  it('shows "Unanswered" when unseenLabel is "Unanswered"', () => {
    renderFilters({ unseenLabel: 'Unanswered' })
    expect(screen.getByText('Unanswered')).toBeInTheDocument()
    expect(screen.queryByText('Previously unseen')).not.toBeInTheDocument()
  })

  it('falls back to "Previously unseen" when no unseenLabel is provided', () => {
    renderFilters()
    expect(screen.getByText('Previously unseen')).toBeInTheDocument()
  })

  it('all switches are off by default (no filters, calcMode all, imageMode all)', () => {
    renderFilters()
    // 3 preference filters + 2 calculation toggles + 2 image toggles
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(7)
    for (const s of switches) {
      expect(s).not.toBeChecked()
    }
  })

  it('marks the correct switch as on when a filter is active', () => {
    renderFilters({ value: ['unseen'] })
    const switches = screen.getAllByRole('switch')
    // Order: unseen, incorrect, flagged
    expect(switches[0]).toBeChecked()
    expect(switches[1]).not.toBeChecked()
    expect(switches[2]).not.toBeChecked()
  })

  it('toggling on a filter calls onValueChange with that filter', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // unseen
    expect(onValueChange).toHaveBeenCalledWith(['unseen'])
  })

  it("toggling off the only active filter reverts to ['all']", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['unseen'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // toggle off unseen
    expect(onValueChange).toHaveBeenCalledWith(['all'])
  })

  it('selecting unseen auto-deselects incorrect and flagged', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['incorrect', 'flagged'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // toggle on unseen
    expect(onValueChange).toHaveBeenCalledWith(['unseen'])
  })

  it('selecting incorrect auto-deselects unseen', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['unseen'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[1]!) // toggle on incorrect
    expect(onValueChange).toHaveBeenCalledWith(['incorrect'])
  })

  it('selecting flagged auto-deselects unseen', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['unseen'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[2]!) // toggle on flagged
    expect(onValueChange).toHaveBeenCalledWith(['flagged'])
  })

  it('incorrect and flagged can be active simultaneously', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['incorrect'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[2]!) // toggle on flagged
    expect(onValueChange).toHaveBeenCalledWith(['incorrect', 'flagged'])
  })

  it('renders a hint button for every toggle (3 filters + 2 calculation + 2 image)', () => {
    renderFilters()
    expect(screen.getAllByLabelText(/Info about/)).toHaveLength(7)
  })

  // ---- Calculation toggles (mutually exclusive, included by default) ------

  it('renders the two calculation toggles, both off by default', () => {
    renderFilters()
    expect(screen.getByRole('switch', { name: 'Only calculation questions' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Exclude calculation questions' })).not.toBeChecked()
  })

  it("marks the 'only' toggle on when calcMode is 'only'", () => {
    renderFilters({ calcMode: 'only' })
    expect(screen.getByRole('switch', { name: 'Only calculation questions' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Exclude calculation questions' })).not.toBeChecked()
  })

  it("marks the 'exclude' toggle on when calcMode is 'exclude'", () => {
    renderFilters({ calcMode: 'exclude' })
    expect(screen.getByRole('switch', { name: 'Exclude calculation questions' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Only calculation questions' })).not.toBeChecked()
  })

  it("toggling 'only' on calls onCalcModeChange with 'only'", async () => {
    const user = userEvent.setup()
    const onCalcModeChange = vi.fn()
    renderFilters({ onCalcModeChange })
    await user.click(screen.getByRole('switch', { name: 'Only calculation questions' }))
    expect(onCalcModeChange).toHaveBeenCalledWith<[CalcMode]>('only')
  })

  it("toggling the active 'only' toggle off reverts to 'all'", async () => {
    const user = userEvent.setup()
    const onCalcModeChange = vi.fn()
    renderFilters({ calcMode: 'only', onCalcModeChange })
    await user.click(screen.getByRole('switch', { name: 'Only calculation questions' }))
    expect(onCalcModeChange).toHaveBeenCalledWith<[CalcMode]>('all')
  })

  it("toggling 'exclude' while 'only' is active switches the mode to 'exclude'", async () => {
    const user = userEvent.setup()
    const onCalcModeChange = vi.fn()
    renderFilters({ calcMode: 'only', onCalcModeChange })
    await user.click(screen.getByRole('switch', { name: 'Exclude calculation questions' }))
    expect(onCalcModeChange).toHaveBeenCalledWith<[CalcMode]>('exclude')
  })

  it("toggling 'only' while 'exclude' is active switches the mode to 'only'", async () => {
    const user = userEvent.setup()
    const onCalcModeChange = vi.fn()
    renderFilters({ calcMode: 'exclude', onCalcModeChange })
    await user.click(screen.getByRole('switch', { name: 'Only calculation questions' }))
    expect(onCalcModeChange).toHaveBeenCalledWith<[CalcMode]>('only')
  })

  it("toggling the active 'exclude' toggle off reverts to 'all'", async () => {
    const user = userEvent.setup()
    const onCalcModeChange = vi.fn()
    renderFilters({ calcMode: 'exclude', onCalcModeChange })
    await user.click(screen.getByRole('switch', { name: 'Exclude calculation questions' }))
    expect(onCalcModeChange).toHaveBeenCalledWith<[CalcMode]>('all')
  })

  // ---- Image toggles (mutually exclusive, included by default) ------

  it('renders the two image toggles, both off by default', () => {
    renderFilters()
    expect(screen.getByRole('switch', { name: 'Only questions with an image' })).not.toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Exclude questions with an image' }),
    ).not.toBeChecked()
  })

  it("marks the image 'only' toggle on when imageMode is 'only'", () => {
    renderFilters({ imageMode: 'only' })
    expect(screen.getByRole('switch', { name: 'Only questions with an image' })).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Exclude questions with an image' }),
    ).not.toBeChecked()
  })

  it("marks the image 'exclude' toggle on when imageMode is 'exclude'", () => {
    renderFilters({ imageMode: 'exclude' })
    expect(screen.getByRole('switch', { name: 'Exclude questions with an image' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Only questions with an image' })).not.toBeChecked()
  })

  it("toggling image 'only' on filters the pool to image questions only", async () => {
    const user = userEvent.setup()
    const onImageModeChange = vi.fn()
    renderFilters({ onImageModeChange })
    await user.click(screen.getByRole('switch', { name: 'Only questions with an image' }))
    expect(onImageModeChange).toHaveBeenCalledWith<[ImageMode]>('only')
  })

  it("toggling the active image 'only' toggle off reverts to 'all'", async () => {
    const user = userEvent.setup()
    const onImageModeChange = vi.fn()
    renderFilters({ imageMode: 'only', onImageModeChange })
    await user.click(screen.getByRole('switch', { name: 'Only questions with an image' }))
    expect(onImageModeChange).toHaveBeenCalledWith<[ImageMode]>('all')
  })

  it("toggling image 'exclude' while 'only' is active switches to 'exclude'", async () => {
    const user = userEvent.setup()
    const onImageModeChange = vi.fn()
    renderFilters({ imageMode: 'only', onImageModeChange })
    await user.click(screen.getByRole('switch', { name: 'Exclude questions with an image' }))
    expect(onImageModeChange).toHaveBeenCalledWith<[ImageMode]>('exclude')
  })

  it("toggling image 'only' while 'exclude' is active switches to 'only'", async () => {
    const user = userEvent.setup()
    const onImageModeChange = vi.fn()
    renderFilters({ imageMode: 'exclude', onImageModeChange })
    await user.click(screen.getByRole('switch', { name: 'Only questions with an image' }))
    expect(onImageModeChange).toHaveBeenCalledWith<[ImageMode]>('only')
  })

  it("toggling the active image 'exclude' toggle off reverts to 'all'", async () => {
    const user = userEvent.setup()
    const onImageModeChange = vi.fn()
    renderFilters({ imageMode: 'exclude', onImageModeChange })
    await user.click(screen.getByRole('switch', { name: 'Exclude questions with an image' }))
    expect(onImageModeChange).toHaveBeenCalledWith<[ImageMode]>('all')
  })
})
