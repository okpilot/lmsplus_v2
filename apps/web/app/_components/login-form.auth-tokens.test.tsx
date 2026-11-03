import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from './login-form'

vi.mock('@repo/db/client', () => ({
  createClient: () => ({ auth: { signInWithPassword: vi.fn() } }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('LoginForm auth tokens', () => {
  it('renders errors as a text-danger FieldError alert, never text-destructive', async () => {
    const { container } = render(<LoginForm />)
    await userEvent.setup().type(screen.getByLabelText(/email address/i), 'bad')
    fireEvent.submit(
      screen.getByRole('button', { name: /sign in/i }).closest('form') as HTMLFormElement,
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'field-error')
    expect(alert).toHaveClass('text-danger')
    expect(container.querySelector('.text-destructive')).toBeNull()
  })

  it('uses a data-slot=button password toggle that flips the input type', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('data-slot', 'button')
    await user.click(toggle)
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  it('underlines Forgot password? and offsets Terms/Privacy underlines', () => {
    const { container } = render(<LoginForm />)
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveClass('underline')
    expect(screen.getByRole('link', { name: /terms/i })).toHaveClass('underline-offset-4')
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveClass('underline-offset-4')
    expect(container.innerHTML).not.toMatch(
      /(red|green|blue|gray|slate)-\d|text-destructive|max-w-\[/,
    )
  })
})
