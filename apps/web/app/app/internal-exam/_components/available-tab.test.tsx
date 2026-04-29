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
}

describe('AvailableTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the empty state when there are no rows', () => {
    render(<AvailableTab rows={[]} userId="user-1" />)
    expect(screen.getByTestId('available-empty')).toHaveTextContent(/no internal exams available/i)
  })

  it('renders the subject short and name in each row', () => {
    render(<AvailableTab rows={[ROW]} userId="user-1" />)
    expect(screen.getByText(/010 — Air Law/)).toBeInTheDocument()
  })

  it('does not display the code value anywhere in the list', () => {
    const sneaky: AvailableInternalExam & { code?: string } = { ...ROW, code: 'SECRETXX' }
    render(<AvailableTab rows={[sneaky as AvailableInternalExam]} userId="user-1" />)
    expect(screen.queryByText('SECRETXX')).toBeNull()
  })

  it('shows the absolute and relative expiry times', () => {
    render(<AvailableTab rows={[ROW]} userId="user-1" />)
    // relative: "in N min" or "in N h"
    expect(screen.getByText(/in \d+/)).toBeInTheDocument()
    // absolute: includes "Expires"
    expect(screen.getByText(/Expires/)).toBeInTheDocument()
  })

  it('opens the code-entry modal when Start is clicked', async () => {
    render(<AvailableTab rows={[ROW]} userId="user-1" />)
    const modal = screen.getByTestId('code-entry-modal')
    expect(modal.getAttribute('data-open')).toBe('false')
    await userEvent.click(screen.getByTestId('start-button'))
    expect(modal.getAttribute('data-open')).toBe('true')
  })
})
