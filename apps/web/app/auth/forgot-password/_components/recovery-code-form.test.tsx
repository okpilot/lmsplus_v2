import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecoveryCodeForm } from './recovery-code-form'

const mockVerifyRecoveryCode = vi.fn()
vi.mock('../actions', () => ({
  verifyRecoveryCode: (...args: unknown[]) => mockVerifyRecoveryCode(...args),
}))

const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const EMAIL = 'pilot@example.com'

describe('RecoveryCodeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the neutral message naming the requested email', () => {
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)

    expect(
      screen.getByText(/if an account exists for.*we sent a reset code to it/i),
    ).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
  })

  it('renders a code input and submit button', () => {
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)

    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify code/i })).toBeInTheDocument()
  })

  it('shows a validation error for a non-numeric code', async () => {
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)
    const form = screen
      .getByRole('button', { name: /verify code/i })
      .closest('form') as HTMLFormElement
    await userEvent.setup().type(screen.getByLabelText(/reset code/i), 'abc')
    fireEvent.submit(form)

    expect(await screen.findByText(/enter the code from your email/i)).toBeInTheDocument()
    expect(mockVerifyRecoveryCode).not.toHaveBeenCalled()
  })

  it('calls verifyRecoveryCode with the email and entered code', async () => {
    mockVerifyRecoveryCode.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)

    await user.type(screen.getByLabelText(/reset code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    expect(mockVerifyRecoveryCode).toHaveBeenCalledWith({ email: EMAIL, code: '123456' })
  })

  it('navigates to the reset-password page on a valid code', async () => {
    mockVerifyRecoveryCode.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)

    await user.type(screen.getByLabelText(/reset code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    expect(mockRouterPush).toHaveBeenCalledWith('/auth/reset-password')
  })

  it('shows the server error and does not navigate when the code is rejected', async () => {
    mockVerifyRecoveryCode.mockResolvedValue({
      ok: false,
      error: 'That code is invalid or has expired.',
    })
    const user = userEvent.setup()
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)

    await user.type(screen.getByLabelText(/reset code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    expect(await screen.findByText(/that code is invalid or has expired/i)).toBeInTheDocument()
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('shows a generic error when verifyRecoveryCode throws an exception', async () => {
    mockVerifyRecoveryCode.mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)

    await user.type(screen.getByLabelText(/reset code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))

    expect(await screen.findByText(/that code is invalid or has expired/i)).toBeInTheDocument()
  })

  it('calls onRequestNewCode when "Send a new code" is clicked', async () => {
    const onRequestNewCode = vi.fn()
    const user = userEvent.setup()
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={onRequestNewCode} />)

    await user.click(screen.getByRole('button', { name: /send a new code/i }))

    expect(onRequestNewCode).toHaveBeenCalled()
  })

  it('renders a "Back to login" link', () => {
    render(<RecoveryCodeForm email={EMAIL} onRequestNewCode={vi.fn()} />)

    const link = screen.getByRole('link', { name: /back to login/i })
    expect(link).toHaveAttribute('href', '/')
  })
})
