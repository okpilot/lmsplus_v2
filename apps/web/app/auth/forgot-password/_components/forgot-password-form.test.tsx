import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordForm } from './forgot-password-form'

const mockResetPasswordForEmail = vi.fn()
vi.mock('@repo/db/client', () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  })

  it('renders an email input and submit button', () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset email/i })).toBeInTheDocument()
  })

  it('shows a validation error for invalid email', async () => {
    render(<ForgotPasswordForm />)
    const form = screen
      .getByRole('button', { name: /send reset email/i })
      .closest('form') as HTMLFormElement
    await userEvent.setup().type(screen.getByLabelText(/email address/i), 'bad')
    fireEvent.submit(form)

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument()
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('calls resetPasswordForEmail with valid email', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send reset email/i }))

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'pilot@example.com',
        expect.objectContaining({
          redirectTo: 'http://localhost:3000/auth/reset-password',
        }),
      )
    })
  })

  it('shows success message after sending reset email', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send reset email/i }))

    await waitFor(() => {
      expect(screen.getByText(/password reset email/i)).toBeInTheDocument()
    })
  })

  it('shows an error when reset fails', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'fail' } })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send reset email/i }))

    expect(await screen.findByText(/unable to send reset email/i)).toBeInTheDocument()
  })

  it('renders a "Back to login" link', () => {
    render(<ForgotPasswordForm />)
    const link = screen.getByRole('link', { name: /back to login/i })
    expect(link).toHaveAttribute('href', '/')
  })
})
