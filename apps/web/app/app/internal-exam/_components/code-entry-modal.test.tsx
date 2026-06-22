import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterPush, mockStartInternalExam } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartInternalExam: vi.fn(),
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
      userId="user-1"
      subjectName="Air Law"
      subjectShort="ALW"
    />,
  )
  return { ...utils, onOpenChange }
}

describe('CodeEntryModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // The successful-start path writes 'quiz-session:<userId>' into sessionStorage.
    // Clear so cases that run after it don't inherit the seed and assert against
    // stale state.
    sessionStorage.clear()
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

  it('writes the session handoff payload and navigates to /app/quiz/session on success', async () => {
    mockStartInternalExam.mockResolvedValue({
      success: true,
      sessionId: 'sess-abc',
      questionIds: ['q-1', 'q-2'],
      timeLimitSeconds: 1800,
      passMark: 75,
      startedAt: '2026-04-29T10:00:00.000Z',
    })
    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')
    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session'))
    const stored = sessionStorage.getItem('quiz-session:user-1')
    expect(stored).not.toBeNull()
    const payload = JSON.parse(stored as string)
    expect(payload).toMatchObject({
      userId: 'user-1',
      sessionId: 'sess-abc',
      mode: 'exam',
      examMode: 'internal_exam',
      questionIds: ['q-1', 'q-2'],
      timeLimitSeconds: 1800,
      passMark: 75,
      subjectName: 'Air Law',
      subjectCode: 'ALW',
    })
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

  it('shows an error and allows a retry when sessionStorage write fails after a successful action response', async () => {
    // The action succeeds but sessionStorage.setItem throws (e.g. quota exceeded or
    // private-browsing restriction). The lock must reset (startedRef.current = false)
    // so the student can retry, and the error banner must be shown.
    mockStartInternalExam.mockResolvedValue({
      success: true,
      sessionId: 'sess-abc',
      questionIds: ['q-1'],
      timeLimitSeconds: 1800,
      passMark: 75,
      startedAt: '2026-04-29T10:00:00.000Z',
    })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })

    renderModal()
    const input = screen.getByTestId('code-input') as HTMLInputElement
    await userEvent.type(input, 'ABCD2345')

    const form = screen.getByTestId('code-entry-form')
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))

    // Error banner shown — router must NOT have been called (no navigation on handoff failure).
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to start internal exam/i),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockStartInternalExam).toHaveBeenCalledTimes(1)

    // Lock is reset — student can retry; this time sessionStorage succeeds.
    setItemSpy.mockRestore()
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    await waitFor(() => expect(mockStartInternalExam).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session'))
  })
})
