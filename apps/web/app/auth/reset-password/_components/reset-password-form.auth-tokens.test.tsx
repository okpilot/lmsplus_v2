import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ResetPasswordForm } from './reset-password-form'

const mockReset = vi.fn()
vi.mock('../actions', () => ({ resetOwnPassword: (...a: unknown[]) => mockReset(...a) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('ResetPasswordForm auth tokens', () => {
  it('renders errors as a text-danger FieldError alert and underlines the links', async () => {
    mockReset.mockResolvedValue({
      ok: false,
      isSessionMissing: true,
      message: 'Your reset session has expired. Please request a new code.',
    })
    const user = userEvent.setup()
    const { container } = render(<ResetPasswordForm />)
    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'field-error')
    expect(alert).toHaveClass('text-danger')
    expect(container.querySelector('.text-destructive')).toBeNull()
    expect(screen.getByRole('link', { name: /request a new code/i })).toHaveClass('underline')
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveClass('underline')
    expect(container.innerHTML).not.toMatch(
      /(red|green|blue|gray|slate)-\d|text-destructive|max-w-\[/,
    )
  })
})
