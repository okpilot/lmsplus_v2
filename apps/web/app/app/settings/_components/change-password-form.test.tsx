import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../actions', () => ({
  updateDisplayName: vi.fn(),
  changePassword: vi.fn(),
}))

import { ChangePasswordForm } from './change-password-form'

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the change password card heading', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByText('Change Password')).toBeInTheDocument()
  })

  it('renders the current password input', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
  })

  it('renders the new password input', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  })

  it('renders the confirm password input', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })

  it('disables the submit button when all fields are empty', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled()
  })

  it('disables the submit button when only the current password is filled', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')

    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled()
  })

  it('enables the submit button when current and new password are both filled', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'newpass456')

    expect(screen.getByRole('button', { name: /update password/i })).not.toBeDisabled()
  })

  it('renders password inputs as type password by default', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('type', 'password')
  })

  it('reveals password text when the show/hide toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.click(screen.getByRole('button', { name: /show password/i }))

    expect(screen.getByLabelText(/current password/i)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('type', 'text')
  })
})
