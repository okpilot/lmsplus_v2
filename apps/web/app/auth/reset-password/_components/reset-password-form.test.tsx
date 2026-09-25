import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetPasswordForm } from './reset-password-form'

const mockResetOwnPassword = vi.fn()
vi.mock('../actions', () => ({
  resetOwnPassword: (...args: unknown[]) => mockResetOwnPassword(...args),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders password and confirm password inputs', () => {
    render(<ResetPasswordForm />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })

  it('shows an error when password is too short', async () => {
    render(<ResetPasswordForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'ab')
    await user.type(screen.getByLabelText(/confirm password/i), 'ab')
    const form = screen
      .getByRole('button', { name: /update password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument()
    expect(mockResetOwnPassword).not.toHaveBeenCalled()
  })

  it('shows an error when passwords do not match', async () => {
    render(<ResetPasswordForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'different456')
    const form = screen
      .getByRole('button', { name: /update password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(mockResetOwnPassword).not.toHaveBeenCalled()
  })

  it('shows success confirmation with login link after password update', async () => {
    mockResetOwnPassword.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(mockResetOwnPassword).toHaveBeenCalledWith({
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      })
    })
    expect(screen.getByText(/password has been updated successfully/i)).toBeInTheDocument()
    const loginLink = screen.getByRole('link', { name: /sign in with your new password/i })
    expect(loginLink).toHaveAttribute('href', '/auth/reset-password/done')
  })

  it('shows a generic error when the action reports failure', async () => {
    mockResetOwnPassword.mockResolvedValue({
      ok: false,
      isSessionMissing: false,
      message: 'Unable to update password. Please try again.',
    })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/unable to update password/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /request a new reset link/i }),
    ).not.toBeInTheDocument()
  })

  it('shows expired session error with link to request new reset when session is missing', async () => {
    mockResetOwnPassword.mockResolvedValue({
      ok: false,
      isSessionMissing: true,
      message: 'Your reset link has expired. Please request a new one.',
    })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/reset link has expired/i)).toBeInTheDocument()
    const resetLink = screen.getByRole('link', { name: /request a new reset link/i })
    expect(resetLink).toHaveAttribute('href', '/auth/forgot-password')
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    const passwordInput = screen.getByLabelText(/new password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')
  })
})
