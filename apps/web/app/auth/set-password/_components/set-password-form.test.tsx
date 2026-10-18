import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetPasswordForm } from './set-password-form'

const mockSetPasswordFromLink = vi.fn()
vi.mock('../actions', () => ({
  setPasswordFromLink: (...args: unknown[]) => mockSetPasswordFromLink(...args),
}))

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

const mockAssign = vi.fn()
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { assign: mockAssign },
})

describe('SetPasswordForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders password and confirm password inputs', () => {
    render(<SetPasswordForm tokenHash={HASH} />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set password/i })).toBeInTheDocument()
  })

  it('shows an error when password is too short', async () => {
    render(<SetPasswordForm tokenHash={HASH} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'ab')
    await user.type(screen.getByLabelText(/confirm password/i), 'ab')
    const form = screen
      .getByRole('button', { name: /set password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument()
    expect(mockSetPasswordFromLink).not.toHaveBeenCalled()
  })

  it('shows an error when passwords do not match', async () => {
    render(<SetPasswordForm tokenHash={HASH} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'different456')
    const form = screen
      .getByRole('button', { name: /set password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(mockSetPasswordFromLink).not.toHaveBeenCalled()
  })

  it('shows the returned error message when the action reports failure', async () => {
    mockSetPasswordFromLink.mockResolvedValue({
      success: false,
      error: 'Choose a different password.',
    })
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/choose a different password/i)).toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('navigates to the redirect target the action returns on success', async () => {
    mockSetPasswordFromLink.mockResolvedValue({ success: true, redirectTo: '/auth/login-complete' })
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/auth/login-complete')
    })
  })

  it('keeps the submit button disabled after a successful submit, while navigation is pending', async () => {
    mockSetPasswordFromLink.mockResolvedValue({ success: true, redirectTo: '/auth/login-complete' })
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/auth/login-complete')
    })
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })

  it('re-enables the submit button after a failed submit', async () => {
    mockSetPasswordFromLink.mockResolvedValue({
      success: false,
      error: 'Choose a different password.',
    })
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/choose a different password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set password/i })).not.toBeDisabled()
  })

  it('sends the token hash and passwords to the action', async () => {
    mockSetPasswordFromLink.mockResolvedValue({ success: true, redirectTo: '/auth/login-complete' })
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => {
      expect(mockSetPasswordFromLink).toHaveBeenCalledWith({
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
        tokenHash: HASH,
        type: 'recovery',
      })
    })
  })

  it('shows the failure message with a Continue link to reset-password when saving fails after the link was used', async () => {
    mockSetPasswordFromLink.mockResolvedValue({
      success: false,
      error: 'That password is too weak. Choose a stronger one on the next screen.',
      redirectTo: '/auth/reset-password',
    })
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/too weak/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/auth/reset-password',
    )
    expect(screen.queryByRole('button', { name: /set password/i })).not.toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('replaces the form with the link-unavailable panel when the link is refused', async () => {
    mockSetPasswordFromLink.mockResolvedValue({
      success: false,
      error: 'This link has expired or has already been used.',
      linkInvalid: true,
    })
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/has expired or has already been used/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('shows a generic error when the action call throws', async () => {
    mockSetPasswordFromLink.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(
      await screen.findByText(/unable to update password\. please try again\./i),
    ).toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(<SetPasswordForm tokenHash={HASH} />)

    const passwordInput = screen.getByLabelText(/new password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')
  })
})
