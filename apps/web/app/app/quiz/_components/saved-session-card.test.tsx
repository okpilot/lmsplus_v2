import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockResume, mockDiscard, mockPush, mockRefresh, mockDeviceId } = vi.hoisted(() => ({
  mockResume: vi.fn(),
  mockDiscard: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockDeviceId: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }))
vi.mock('../actions/saved-quiz', () => ({
  resumeSavedQuiz: (...args: unknown[]) => mockResume(...args),
  discardSavedQuiz: (...args: unknown[]) => mockDiscard(...args),
}))
vi.mock('../session/_utils/quiz-device-id', () => ({ getQuizDeviceId: () => mockDeviceId() }))

import type { SavedQuizSession } from '@/lib/queries/load-saved-quizzes'
import { SavedSessionCard } from './saved-session-card'

const SAVED: SavedQuizSession = {
  sessionId: 'saved-1',
  mode: 'quick_quiz',
  savedAt: '2026-10-04T09:00:00Z',
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  totalCount: 10,
  answeredCount: 4,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDeviceId.mockReturnValue('device-1')
  mockResume.mockResolvedValue({ success: true })
  mockDiscard.mockResolvedValue({ success: true })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('SavedSessionCard', () => {
  it('shows the subject, the mode and how many questions are answered', () => {
    render(<SavedSessionCard session={SAVED} />)
    expect(screen.getByText('Air Law')).toBeInTheDocument()
    expect(screen.getByText('Quick Quiz')).toBeInTheDocument()
    expect(screen.getByText('4 of 10 answered')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('resumes on the same session id and navigates to /app/quiz/session/<id>', async () => {
    render(<SavedSessionCard session={SAVED} />)
    fireEvent.click(screen.getByTestId('resume-saved-session'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/saved-1'))
    expect(mockResume).toHaveBeenCalledWith({ sessionId: 'saved-1', deviceId: 'device-1' })
  })

  it('shows the mapped error and stays on the page when resume fails', async () => {
    mockResume.mockResolvedValue({ success: false, error: 'Finish your open quiz first.' })
    render(<SavedSessionCard session={SAVED} />)
    fireEvent.click(screen.getByTestId('resume-saved-session'))

    expect(await screen.findByText('Finish your open quiz first.')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('stays retryable after a thrown resume', async () => {
    mockResume.mockRejectedValueOnce(new Error('network'))
    render(<SavedSessionCard session={SAVED} />)
    fireEvent.click(screen.getByTestId('resume-saved-session'))
    expect(await screen.findByText(/unable to resume/i)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('resume-saved-session'))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/saved-1'))
  })

  it('resumes once when clicked twice in the same tick', async () => {
    render(<SavedSessionCard session={SAVED} />)
    const button = screen.getByTestId('resume-saved-session')
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
    expect(mockResume).toHaveBeenCalledTimes(1)
  })

  it('discards the saved quiz after confirmation and refreshes the list', async () => {
    render(<SavedSessionCard session={SAVED} />)
    fireEvent.click(screen.getByTestId('delete-saved-session'))

    await waitFor(() => expect(mockDiscard).toHaveBeenCalledWith({ sessionId: 'saved-1' }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('does not discard when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SavedSessionCard session={SAVED} />)
    fireEvent.click(screen.getByTestId('delete-saved-session'))

    await new Promise((r) => setTimeout(r, 0))
    expect(mockDiscard).not.toHaveBeenCalled()
  })

  it('shows the mapped error and does not refresh when discard fails', async () => {
    mockDiscard.mockResolvedValue({ success: false, error: 'Could not discard.' })
    render(<SavedSessionCard session={SAVED} />)
    fireEvent.click(screen.getByTestId('delete-saved-session'))

    expect(await screen.findByText('Could not discard.')).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
