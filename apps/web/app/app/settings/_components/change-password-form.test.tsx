import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../actions', () => ({
  updateDisplayName: vi.fn(),
  changePassword: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { changePassword } from '../actions'
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

  it('keeps the submit button disabled when confirm password is empty', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'newpass456')

    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled()
  })

  it('enables the submit button when all three fields are filled', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'newpass456')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpass456')

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

  it('shows an error when new password and confirm password do not match', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'newpass456')
    await user.type(screen.getByLabelText(/confirm password/i), 'different789')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match')
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('shows an error when new password is too short', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'abc')
    await user.type(screen.getByLabelText(/confirm password/i), 'abc')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password must be at least 6 characters',
    )
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('calls changePassword and shows success toast on valid submit', async () => {
    vi.mocked(changePassword).mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'newpass456')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpass456')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'secret123',
        password: 'newpass456',
      })
      expect(toast.success).toHaveBeenCalledWith('Password updated')
    })
  })

  it('shows server error message when changePassword returns a failure', async () => {
    vi.mocked(changePassword).mockResolvedValue({ success: false, error: 'Wrong password' })
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'newpass456')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpass456')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password')
  })

  it('shows a fallback error when changePassword throws', async () => {
    vi.mocked(changePassword).mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText(/current password/i), 'secret123')
    await user.type(screen.getByLabelText(/new password/i), 'newpass456')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpass456')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to update password. Please try again.',
    )
  })
})
