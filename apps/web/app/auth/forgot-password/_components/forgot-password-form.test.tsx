import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordForm } from './forgot-password-form'

const mockRequestRecoveryCode = vi.fn()
const mockVerifyRecoveryCode = vi.fn()
vi.mock('../actions', () => ({
  requestRecoveryCode: (...args: unknown[]) => mockRequestRecoveryCode(...args),
  verifyRecoveryCode: (...args: unknown[]) => mockVerifyRecoveryCode(...args),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an email input and submit button', () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset code/i })).toBeInTheDocument()
  })

  it('shows a validation error for invalid email', async () => {
    render(<ForgotPasswordForm />)
    const form = screen
      .getByRole('button', { name: /send reset code/i })
      .closest('form') as HTMLFormElement
    await userEvent.setup().type(screen.getByLabelText(/email address/i), 'bad')
    fireEvent.submit(form)

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument()
    expect(mockRequestRecoveryCode).not.toHaveBeenCalled()
  })

  it('calls requestRecoveryCode with the entered email', async () => {
    mockRequestRecoveryCode.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    expect(mockRequestRecoveryCode).toHaveBeenCalledWith({ email: 'pilot@example.com' })
  })

  it('shows the neutral code-sent message and a code field after requesting a code', async () => {
    mockRequestRecoveryCode.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    expect(
      await screen.findByText(/if an account exists for.*we sent a reset code to it/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument()
  })

  it('shows an error when the request itself is rejected', async () => {
    mockRequestRecoveryCode.mockResolvedValue({ ok: false, error: 'Invalid email' })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument()
  })

  it('shows an error when requestRecoveryCode throws an exception', async () => {
    mockRequestRecoveryCode.mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    expect(await screen.findByText(/unable to send reset code/i)).toBeInTheDocument()
  })

  it('renders a "Back to login" link', () => {
    render(<ForgotPasswordForm />)
    const link = screen.getByRole('link', { name: /back to login/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders a "Terms of Service" link to /legal/terms', () => {
    render(<ForgotPasswordForm />)
    const link = screen.getByRole('link', { name: /terms of service/i })
    expect(link).toHaveAttribute('href', '/legal/terms')
  })

  it('renders a "Privacy Policy" link to /legal/privacy', () => {
    render(<ForgotPasswordForm />)
    const link = screen.getByRole('link', { name: /privacy policy/i })
    expect(link).toHaveAttribute('href', '/legal/privacy')
  })
})
