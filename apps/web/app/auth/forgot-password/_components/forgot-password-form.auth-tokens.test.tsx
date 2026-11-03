import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ForgotPasswordForm } from './forgot-password-form'

vi.mock('../actions', () => ({ requestRecoveryCode: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('ForgotPasswordForm auth tokens', () => {
  it('renders errors as a text-danger FieldError alert, never text-destructive', async () => {
    const { container } = render(<ForgotPasswordForm />)
    await userEvent.setup().type(screen.getByLabelText(/email address/i), 'bad')
    fireEvent.submit(
      screen.getByRole('button', { name: /send reset code/i }).closest('form') as HTMLFormElement,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'field-error')
    expect(alert).toHaveClass('text-danger')
    expect(container.querySelector('.text-destructive')).toBeNull()
  })

  it('underlines Back to login and offsets Terms/Privacy underlines', () => {
    const { container } = render(<ForgotPasswordForm />)
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveClass('underline')
    expect(screen.getByRole('link', { name: /terms/i })).toHaveClass('underline-offset-4')
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveClass('underline-offset-4')
    expect(container.innerHTML).not.toMatch(
      /(red|green|blue|gray|slate)-\d|text-destructive|max-w-\[/,
    )
  })
})
