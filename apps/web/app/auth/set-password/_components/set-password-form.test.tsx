import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetPasswordForm } from './set-password-form'

const mockSetOwnPassword = vi.fn()
vi.mock('../actions', () => ({
  setOwnPassword: (...args: unknown[]) => mockSetOwnPassword(...args),
}))

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
    render(<SetPasswordForm nextPath={null} />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set password/i })).toBeInTheDocument()
  })

  it('shows an error when password is too short', async () => {
    render(<SetPasswordForm nextPath={null} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'ab')
    await user.type(screen.getByLabelText(/confirm password/i), 'ab')
    const form = screen
      .getByRole('button', { name: /set password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument()
    expect(mockSetOwnPassword).not.toHaveBeenCalled()
  })

  it('shows an error when passwords do not match', async () => {
    render(<SetPasswordForm nextPath={null} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'different456')
    const form = screen
      .getByRole('button', { name: /set password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(mockSetOwnPassword).not.toHaveBeenCalled()
  })

  it('shows the returned error message when the action reports failure', async () => {
    mockSetOwnPassword.mockResolvedValue({
      success: false,
      error: 'Choose a different password.',
    })
    const user = userEvent.setup()
    render(<SetPasswordForm nextPath={null} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/choose a different password/i)).toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('navigates to the exact next path on success', async () => {
    mockSetOwnPassword.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<SetPasswordForm nextPath="/app/quiz" />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/app/quiz')
    })
  })

  it('keeps the submit button disabled after a successful submit, while navigation is pending', async () => {
    mockSetOwnPassword.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<SetPasswordForm nextPath="/app/quiz" />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/app/quiz')
    })
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })

  it('re-enables the submit button after a failed submit', async () => {
    mockSetOwnPassword.mockResolvedValue({
      success: false,
      error: 'Choose a different password.',
    })
    const user = userEvent.setup()
    render(<SetPasswordForm nextPath={null} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/choose a different password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set password/i })).not.toBeDisabled()
  })

  it('navigates to /app/dashboard on success when there is no next path', async () => {
    mockSetOwnPassword.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<SetPasswordForm nextPath={null} />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/app/dashboard')
    })
  })

  it('shows a generic error when the action call throws', async () => {
    mockSetOwnPassword.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<SetPasswordForm nextPath={null} />)

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
    render(<SetPasswordForm nextPath={null} />)

    const passwordInput = screen.getByLabelText(/new password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')
  })
})
