import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./code-entry-modal', () => ({
  CodeEntryModal: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (o: boolean) => void
  }) => (
    <button
      type="button"
      data-testid="code-entry-modal"
      data-open={open ? 'true' : 'false'}
      onClick={() => onOpenChange(false)}
    />
  ),
}))

import type { AvailableInternalExam } from '../queries'
import { AvailableTab } from './available-tab'

const ROW: AvailableInternalExam = {
  id: 'code-1',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  subjectShort: '010',
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  issuedAt: new Date().toISOString(),
  sitting: null,
}

describe('AvailableTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the empty state when there are no rows', () => {
    render(<AvailableTab rows={[]} />)
    expect(screen.getByTestId('available-empty')).toHaveTextContent(/no internal exams available/i)
  })

  it('renders the empty state with the shared empty part', () => {
    render(<AvailableTab rows={[]} />)
    expect(screen.getByTestId('available-empty')).toHaveAttribute('data-slot', 'empty')
  })

  it('renders the subject short and name in each row', () => {
    render(<AvailableTab rows={[ROW]} />)
    expect(screen.getByText(/010 — Air Law/)).toBeInTheDocument()
  })

  it('does not display the code value anywhere in the list', () => {
    const sneaky: AvailableInternalExam & { code?: string } = { ...ROW, code: 'SECRETXX' }
    render(<AvailableTab rows={[sneaky as AvailableInternalExam]} />)
    expect(screen.queryByText('SECRETXX')).toBeNull()
  })

  it('shows the absolute and relative expiry times', () => {
    render(<AvailableTab rows={[ROW]} />)
    // relative: "in N min" or "in N h"
    expect(screen.getByText(/in \d+/)).toBeInTheDocument()
    // absolute: includes "Expires"
    expect(screen.getByText(/Expires/)).toBeInTheDocument()
  })

  it('opens the code-entry modal when Start is clicked', async () => {
    render(<AvailableTab rows={[ROW]} />)
    const modal = screen.getByTestId('code-entry-modal')
    expect(modal.getAttribute('data-open')).toBe('false')
    await userEvent.click(screen.getByTestId('start-button'))
    expect(modal.getAttribute('data-open')).toBe('true')
  })

  describe('sitting rows', () => {
    const SITTING_ROW = (status: string): AvailableInternalExam => ({
      ...ROW,
      sitting: {
        id: 'sit-1',
        scheduledAt: '2026-05-01T09:30:00.000Z',
        mode: 'remote',
        status,
      } as AvailableInternalExam['sitting'],
    })

    it('shows the UTC date, time and mode caption', () => {
      render(<AvailableTab rows={[SITTING_ROW('scheduled')]} />)
      expect(screen.getByText(/1 May 2026.*09:30.*UTC.*Remote/)).toBeInTheDocument()
    })

    it('labels in-person mode', () => {
      const row = SITTING_ROW('open')
      render(
        <AvailableTab
          rows={[{ ...row, sitting: { ...row.sitting!, mode: 'in_person' } as never }]}
        />,
      )
      expect(screen.getByText(/In person/)).toBeInTheDocument()
    })

    it('disables Start with a reason hint while the sitting is not open', () => {
      render(<AvailableTab rows={[SITTING_ROW('scheduled')]} />)
      const start = screen.getByTestId('start-button')
      expect(start).toBeDisabled()
      const hint = screen.getByText('Opens when your invigilator starts the sitting.')
      expect(start.getAttribute('aria-describedby')).toBe(hint.id)
    })

    it('disables Start for a closed sitting as well', () => {
      render(<AvailableTab rows={[SITTING_ROW('closed')]} />)
      expect(screen.getByTestId('start-button')).toBeDisabled()
    })

    it('disables Start for a cancelled sitting', () => {
      render(<AvailableTab rows={[SITTING_ROW('cancelled')]} />)
      expect(screen.getByTestId('start-button')).toBeDisabled()
    })

    it('enables Start with the open hint when the sitting is open', () => {
      render(<AvailableTab rows={[SITTING_ROW('open')]} />)
      expect(screen.getByTestId('start-button')).toBeEnabled()
      expect(screen.getByText('Works while the sitting is open.')).toBeInTheDocument()
    })

    it('shows no Expires line on a sitting row', () => {
      render(<AvailableTab rows={[SITTING_ROW('open')]} />)
      expect(screen.queryByText(/Expires/)).not.toBeInTheDocument()
    })

    it('keeps the legacy row with an Expires line and Start enabled', () => {
      render(<AvailableTab rows={[ROW]} />)
      expect(screen.getByText(/Expires/)).toBeInTheDocument()
      expect(screen.getByTestId('start-button')).toBeEnabled()
      expect(screen.queryByText(/invigilator starts/)).not.toBeInTheDocument()
    })
  })
})
