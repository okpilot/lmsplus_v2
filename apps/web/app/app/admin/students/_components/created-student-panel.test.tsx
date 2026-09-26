import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandleSend = vi.hoisted(() => vi.fn())
const mockUseSendLoginInstructions = vi.hoisted(() => vi.fn())

vi.mock('../_hooks/use-send-login-instructions', () => ({
  useSendLoginInstructions: mockUseSendLoginInstructions,
}))

import { CreatedStudentPanel } from './created-student-panel'

const STUDENT_ID = 'student-1'
const EMAIL = 'alice@example.com'
const FULL_NAME = 'Alice Example'

beforeEach(() => {
  vi.resetAllMocks()
  mockUseSendLoginInstructions.mockReturnValue({ isSending: false, handleSend: mockHandleSend })
})

describe('CreatedStudentPanel', () => {
  it('shows the creation confirmation and a Send login instructions button', () => {
    render(
      <CreatedStudentPanel
        studentId={STUDENT_ID}
        email={EMAIL}
        fullName={FULL_NAME}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Student created.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send login instructions' })).toBeInTheDocument()
  })

  it('opens the not-sent confirmation naming the student before sending', () => {
    render(
      <CreatedStudentPanel
        studentId={STUDENT_ID}
        email={EMAIL}
        fullName={FULL_NAME}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send login instructions' }))

    expect(
      screen.getByText(
        'Send login instructions to Alice Example? Any password they use now stops working.',
      ),
    ).toBeInTheDocument()
    expect(mockHandleSend).not.toHaveBeenCalled()
  })

  it('falls back to the email when full name is blank in the confirmation text', () => {
    render(
      <CreatedStudentPanel studentId={STUDENT_ID} email={EMAIL} fullName="" onClose={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send login instructions' }))

    expect(
      screen.getByText(
        'Send login instructions to alice@example.com? Any password they use now stops working.',
      ),
    ).toBeInTheDocument()
  })

  it('calls handleSend only after Confirm is clicked', () => {
    render(
      <CreatedStudentPanel
        studentId={STUDENT_ID}
        email={EMAIL}
        fullName={FULL_NAME}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send login instructions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(mockHandleSend).toHaveBeenCalledTimes(1)
  })

  it('closes the confirmation without sending when Cancel is clicked', () => {
    render(
      <CreatedStudentPanel
        studentId={STUDENT_ID}
        email={EMAIL}
        fullName={FULL_NAME}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send login instructions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockHandleSend).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send login instructions' })).toBeInTheDocument()
  })

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn()
    render(
      <CreatedStudentPanel
        studentId={STUDENT_ID}
        email={EMAIL}
        fullName={FULL_NAME}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not let the admin close the panel while a send is in flight', () => {
    mockUseSendLoginInstructions.mockReturnValue({ isSending: true, handleSend: mockHandleSend })
    const onClose = vi.fn()
    render(
      <CreatedStudentPanel
        studentId={STUDENT_ID}
        email={EMAIL}
        fullName={FULL_NAME}
        onClose={onClose}
      />,
    )

    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toBeDisabled()
    fireEvent.click(close)
    expect(onClose).not.toHaveBeenCalled()
  })
})
