import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentRow } from '../types'

const mockHandleSend = vi.hoisted(() => vi.fn())
const mockUseSendLoginInstructions = vi.hoisted(() => vi.fn())

vi.mock('../_hooks/use-send-login-instructions', () => ({
  useSendLoginInstructions: mockUseSendLoginInstructions,
}))

import { LoginInstructionsCell } from './login-instructions-cell'

function buildStudent(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: 'student-1',
    email: 'alice@example.com',
    full_name: 'Alice Example',
    role: 'student',
    organization_id: 'org-1',
    last_active_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    login_instructions_sent_at: null,
    temp_password_expires_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseSendLoginInstructions.mockReturnValue({ isSending: false, handleSend: mockHandleSend })
})

describe('LoginInstructionsCell', () => {
  it('shows "Not sent yet" and a Send button for a student who was never sent instructions', () => {
    render(<LoginInstructionsCell student={buildStudent()} />)

    expect(screen.getByText('Not sent yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('shows the expiry date and a Resend button while a temporary password is still valid', () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
    render(
      <LoginInstructionsCell
        student={buildStudent({
          login_instructions_sent_at: '2026-06-14T00:00:00.000Z',
          temp_password_expires_at: farFuture,
        })}
      />,
    )

    expect(screen.getByText(/Waiting \(valid until/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
    expect(screen.getByText(/^Sent /)).toBeInTheDocument()
  })

  it('shows "Password set" once the student has chosen their own password', () => {
    render(
      <LoginInstructionsCell
        student={buildStudent({ login_instructions_sent_at: '2026-06-01T00:00:00.000Z' })}
      />,
    )

    expect(screen.getByText('Password set')).toBeInTheDocument()
  })

  it('shows no Send/Resend button for a deactivated student', () => {
    render(
      <LoginInstructionsCell student={buildStudent({ deleted_at: '2026-06-01T00:00:00.000Z' })} />,
    )

    expect(screen.getByText('Not sent yet')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens an inline confirmation naming the student before sending for the first time', () => {
    render(<LoginInstructionsCell student={buildStudent()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(
      screen.getByText(
        'Send login instructions to Alice Example? Any password they use now stops working.',
      ),
    ).toBeInTheDocument()
    expect(mockHandleSend).not.toHaveBeenCalled()
  })

  it('warns that resending replaces a self-chosen password when the state is password_set', () => {
    render(
      <LoginInstructionsCell
        student={buildStudent({ login_instructions_sent_at: '2026-06-01T00:00:00.000Z' })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Resend' }))

    expect(
      screen.getByText(
        'Alice Example has their own password. Resending replaces it with a new temporary one.',
      ),
    ).toBeInTheDocument()
  })

  it('calls handleSend only after Confirm is clicked', () => {
    render(<LoginInstructionsCell student={buildStudent()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(mockHandleSend).toHaveBeenCalledTimes(1)
  })

  it('closes the confirmation without sending when Cancel is clicked', () => {
    render(<LoginInstructionsCell student={buildStudent()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockHandleSend).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})
