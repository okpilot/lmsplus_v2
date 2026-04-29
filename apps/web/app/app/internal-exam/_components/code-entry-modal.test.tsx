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
})
