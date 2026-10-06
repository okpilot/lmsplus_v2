import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRouterPush,
  mockStartInternalExam,
  mockGetActivePracticeSession,
  mockClaim,
  mockSave,
  mockCheckRoom,
} = vi.hoisted(() => ({
  mockCheckRoom: vi.fn(),
  mockRouterPush: vi.fn(),
  mockStartInternalExam: vi.fn(),
  mockGetActivePracticeSession: vi.fn(),
  mockClaim: vi.fn(),
  mockSave: vi.fn(),
}))

vi.mock('@/app/app/quiz/actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))
vi.mock('@/app/app/quiz/actions/quiz-progress', () => ({
  claimQuizSession: (...args: unknown[]) => mockClaim(...args),
}))
vi.mock('@/app/app/quiz/actions/saved-quiz', () => ({
  saveQuizForLater: (...args: unknown[]) => mockSave(...args),
  checkSavedQuizRoom: (...args: unknown[]) => mockCheckRoom(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start-internal-exam', () => ({
  startInternalExam: (...args: unknown[]) => mockStartInternalExam(...args),
}))

// Render Base UI Dialog as a plain div so jsdom can drive it deterministically.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { CodeEntryModal } from './code-entry-modal'

function renderModal(open = true) {
  const onOpenChange = vi.fn()
  const utils = render(
    <CodeEntryModal
      open={open}
      onOpenChange={onOpenChange}
      subjectName="Air Law"
      subjectShort="ALW"
    />,
  )
  return { ...utils, onOpenChange }
}

describe('CodeEntryModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockClaim.mockResolvedValue({ success: true })
    mockSave.mockResolvedValue({ success: true })
    mockCheckRoom.mockResolvedValue({ success: true })
  })

  it('disables the submit button when the input is empty', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /start exam/i })).toBeDisabled()
  })

  it('uppercases input and rejects characters outside the Crockford alphabet', async () => {
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    // I, O, 0, 1 are NOT in the alphabet; lowercase should uppercase
    await userEvent.type(input, 'aiob01x9')
    // After sanitize: A (a→A), I rejected, O rejected, B (uppercased), 0 rejected, 1 rejected, X, 9
    expect(input.value).toBe('ABX9')
  })

  it('truncates input to 8 valid characters when more are pasted', async () => {
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    // 12 valid alphabet chars — sanitize() must clip to first 8.
    await userEvent.click(input)
    await userEvent.paste('ABCD2345EFGH')
    expect(input.value).toBe('ABCD2345')
    expect(input.value.length).toBe(8)
  })

  it('does NOT call the action when the code is shorter than 8 chars', async () => {
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD23')
    // submit button is disabled below 8 valid chars
    expect(screen.getByRole('button', { name: /start exam/i })).toBeDisabled()
    // also if user submits the form somehow, action shouldn't fire
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))
    expect(mockStartInternalExam).not.toHaveBeenCalled()
  })

  it('calls startInternalExam with a valid 8-char code', async () => {
    mockStartInternalExam.mockResolvedValue({ success: true, sessionId: 'sess-123' })
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() => expect(mockStartInternalExam).toHaveBeenCalledWith({ code: 'ABCD2345' }))
  })

  it('navigates to /app/quiz/session/<id> on success without writing sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    mockStartInternalExam.mockResolvedValue({ success: true, sessionId: 'sess-abc' })
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session/sess-abc'))
    expect(setItem).not.toHaveBeenCalled()
  })

  it('offers to save the open practice quiz when the start is blocked, then starts', async () => {
    mockStartInternalExam
      .mockResolvedValueOnce({ success: false, error: 'Another session is active', blocked: true })
      .mockResolvedValueOnce({ success: true, sessionId: 'sess-abc' })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Meteorology' },
    })
    renderModal()
    await userEvent.type(screen.getByTestId('code-input'), 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await userEvent.click(
      await screen.findByRole('button', { name: /save quiz for later and start exam/i }),
    )

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session/sess-abc'))
    expect(mockStartInternalExam).toHaveBeenCalledTimes(2)
    expect(mockClaim).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'blocker-1' }))
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'blocker-1' }))
  })

  it('withdraws the save-and-start offer when the code is edited, and starts only the new code', async () => {
    mockStartInternalExam
      .mockResolvedValueOnce({ success: false, error: 'Another session is active', blocked: true })
      .mockResolvedValueOnce({ success: true, sessionId: 'sess-new' })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Meteorology' },
    })
    renderModal()
    const input = screen.getByTestId('code-input')
    await userEvent.type(input, 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))
    await screen.findByRole('button', { name: /save quiz for later and start exam/i })

    await userEvent.type(input, '{Backspace}9')

    expect(
      screen.queryByRole('button', { name: /save quiz for later and start exam/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Another session is active')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session/sess-new'))
    expect(mockStartInternalExam).toHaveBeenLastCalledWith({ code: 'ABCD2349' })
    expect(mockClaim).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('locks the code input while the open practice quiz is being saved', async () => {
    mockStartInternalExam.mockResolvedValueOnce({
      success: false,
      error: 'Another session is active',
      blocked: true,
    })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Meteorology' },
    })
    mockClaim.mockReturnValue(new Promise(() => {}))
    renderModal()
    const input = screen.getByTestId('code-input')
    await userEvent.type(input, 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await userEvent.click(
      await screen.findByRole('button', { name: /save quiz for later and start exam/i }),
    )

    await waitFor(() => expect(input).toBeDisabled())
  })

  it('renders the action error with role="alert" and does not navigate on failure', async () => {
    mockStartInternalExam.mockResolvedValue({ success: false, error: 'This code has expired.' })
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/this code has expired/i),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('shows a generic error and does not navigate when the action throws', async () => {
    mockStartInternalExam.mockRejectedValue(new Error('boom'))
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  // ---- Synchronous re-entry guard -----------------------------------------

  it('starts the exam once when the form is submitted twice before the action resolves', async () => {
    // Never-resolving promise keeps isPending true so the button stays in the
    // loading state, simulating a double-submit race.
    mockStartInternalExam.mockReturnValue(new Promise(() => {}))
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')

    const form = screen.getByTestId('code-entry-form')
    // Dispatch two submit events back-to-back without awaiting the transition.
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))

    await waitFor(() => expect(mockStartInternalExam).toHaveBeenCalledTimes(1))
  })

  it('allows a retry after the action returns a failure response', async () => {
    // First call fails, second call also fails — both must go through.
    mockStartInternalExam
      .mockResolvedValueOnce({ success: false, error: 'Code expired.' })
      .mockResolvedValueOnce({ success: false, error: 'Code expired again.' })
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')

    const form = screen.getByTestId('code-entry-form')

    // First attempt — action returns a failure. Dispatch form submit and wait for
    // the error alert to appear (confirming the action ran and setError was called).
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/code expired/i))
    expect(mockStartInternalExam).toHaveBeenCalledTimes(1)

    // Lock resets on failure — second attempt dispatched after the alert confirms
    // the transition settled must also invoke the action.
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await waitFor(() => expect(mockStartInternalExam).toHaveBeenCalledTimes(2))
  })

  it('allows a retry after the action throws', async () => {
    mockStartInternalExam
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ success: false, error: 'Code expired.' })
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')

    const form = screen.getByTestId('code-entry-form')

    // First attempt — action throws. Wait for the error alert (transition settled).
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i),
    )
    expect(mockStartInternalExam).toHaveBeenCalledTimes(1)

    // Lock resets after a throw — second attempt must proceed.
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await waitFor(() => expect(mockStartInternalExam).toHaveBeenCalledTimes(2))
  })
})
