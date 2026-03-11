import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockStartReviewSession = vi.fn()
vi.mock('../actions', () => ({
  startReviewSession: (...args: unknown[]) => mockStartReviewSession(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { ReviewConfigForm } from './review-config-form'

// ---- Fixtures -------------------------------------------------------------

const SUBJECTS = [
  { id: 's1', code: 'ALW', name: 'Air Law', short: 'ALW', questionCount: 50 },
  { id: 's2', code: 'NAV', name: 'Navigation', short: 'NAV', questionCount: 30 },
]

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() })
})

describe('ReviewConfigForm', () => {
  it('shows due count and start button', () => {
    render(<ReviewConfigForm subjects={SUBJECTS} dueCount={12} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Smart Review' })).toBeInTheDocument()
  })

  it('disables button when dueCount is 0', () => {
    render(<ReviewConfigForm subjects={SUBJECTS} dueCount={0} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows subject checkboxes when multiple subjects exist', () => {
    render(<ReviewConfigForm subjects={SUBJECTS} dueCount={5} />)
    expect(screen.getByLabelText(/ALW/)).toBeInTheDocument()
    expect(screen.getByLabelText(/NAV/)).toBeInTheDocument()
  })

  it('hides subject checkboxes when only one subject exists', () => {
    render(<ReviewConfigForm subjects={[SUBJECTS[0]!]} dueCount={5} />)
    expect(screen.queryByLabelText(/ALW/)).not.toBeInTheDocument()
  })

  it('calls startReviewSession without subjectIds when none selected', async () => {
    const user = userEvent.setup()
    mockStartReviewSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1',
      questionIds: ['q1'],
    })

    render(<ReviewConfigForm subjects={SUBJECTS} dueCount={5} />)
    await user.click(screen.getByRole('button', { name: 'Start Smart Review' }))

    expect(mockStartReviewSession).toHaveBeenCalledWith({ subjectIds: undefined })
    expect(mockPush).toHaveBeenCalledWith('/app/review/session')
  })

  it('passes selected subjectIds to startReviewSession', async () => {
    const user = userEvent.setup()
    mockStartReviewSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-2',
      questionIds: ['q2'],
    })

    render(<ReviewConfigForm subjects={SUBJECTS} dueCount={5} />)
    await user.click(screen.getByLabelText(/ALW/))
    await user.click(screen.getByRole('button', { name: 'Start Smart Review' }))

    expect(mockStartReviewSession).toHaveBeenCalledWith({ subjectIds: ['s1'] })
  })

  it('shows error message on failure', async () => {
    const user = userEvent.setup()
    mockStartReviewSession.mockResolvedValue({ success: false, error: 'No cards due' })

    render(<ReviewConfigForm subjects={SUBJECTS} dueCount={5} />)
    await user.click(screen.getByRole('button', { name: 'Start Smart Review' }))

    expect(screen.getByText('No cards due')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
