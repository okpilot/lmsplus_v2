import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockRouterPush, mockStartOralExam } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartOralExam: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start-oral-exam', () => ({
  startOralExam: (...args: unknown[]) => mockStartOralExam(...args),
}))

// ---- Subject under test -------------------------------------------------------

import { ElpHome } from './elp-home'

// ---- Fixtures -----------------------------------------------------------------

const ACTIVE_SESSION = {
  id: 'sess-active-1',
  status: 'active',
  mode: 'practice',
  sections: [{ sectionNo: 1, type: 'interview' }],
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests ----------------------------------------------------------------------

describe('ElpHome — active session', () => {
  it('renders a resume link pointing at the active session and no Start button', () => {
    render(<ElpHome activeSession={ACTIVE_SESSION} />)

    expect(
      screen.getByRole('link', { name: /resume your §1 interview practice/i }),
    ).toHaveAttribute('href', '/app/elp/session/sess-active-1')
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
  })

  it('labels the resume link as the Mock Exam when the active session is a mock exam', () => {
    render(<ElpHome activeSession={{ ...ACTIVE_SESSION, mode: 'mock' }} />)

    expect(screen.getByRole('link', { name: /resume your mock exam/i })).toHaveAttribute(
      'href',
      '/app/elp/session/sess-active-1',
    )
  })
})

describe('ElpHome — no active session', () => {
  it('renders the Start button when there is no active session', () => {
    render(<ElpHome activeSession={null} />)
    expect(screen.getByRole('button', { name: /start §1 interview practice/i })).toBeInTheDocument()
  })

  it('starts a practice session and navigates to it on success', async () => {
    mockStartOralExam.mockResolvedValue({ success: true, sessionId: 'sess-new-1' })
    render(<ElpHome activeSession={null} />)

    await userEvent.click(screen.getByRole('button', { name: /start §1 interview practice/i }))

    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledWith('practice'))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-new-1'))
  })

  it('starts a mock exam and navigates to it on success', async () => {
    mockStartOralExam.mockResolvedValue({ success: true, sessionId: 'sess-mock-1' })
    render(<ElpHome activeSession={null} />)

    await userEvent.click(screen.getByRole('button', { name: /start mock exam/i }))

    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledWith('mock'))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-mock-1'))
  })

  it('shows the error and does not navigate when starting fails', async () => {
    mockStartOralExam.mockResolvedValue({
      success: false,
      error: 'You already have an oral exam in progress.',
    })
    render(<ElpHome activeSession={null} />)

    await userEvent.click(screen.getByRole('button', { name: /start §1 interview practice/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'You already have an oral exam in progress.',
      ),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('shows a generic error and does not navigate when starting throws', async () => {
    mockStartOralExam.mockRejectedValue(new Error('network failure'))
    render(<ElpHome activeSession={null} />)

    await userEvent.click(screen.getByRole('button', { name: /start §1 interview practice/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('starts the session once when clicked twice before the first response settles', async () => {
    let resolveStart!: (v: { success: true; sessionId: string }) => void
    mockStartOralExam.mockReturnValue(
      new Promise<{ success: true; sessionId: string }>((res) => {
        resolveStart = res
      }),
    )
    render(<ElpHome activeSession={null} />)

    const button = screen.getByRole('button', { name: /start §1 interview practice/i })
    await userEvent.click(button)
    await userEvent.click(button)

    expect(mockStartOralExam).toHaveBeenCalledTimes(1)

    resolveStart({ success: true, sessionId: 'sess-new-2' })
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-new-2'))
  })

  it('allows a retry after a failed start attempt', async () => {
    mockStartOralExam
      .mockResolvedValueOnce({ success: false, error: 'Failed to start oral exam.' })
      .mockResolvedValueOnce({ success: true, sessionId: 'sess-new-3' })
    render(<ElpHome activeSession={null} />)

    const button = screen.getByRole('button', { name: /start §1 interview practice/i })
    await userEvent.click(button)
    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledTimes(1))

    await userEvent.click(button)
    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-new-3'))
  })
})
