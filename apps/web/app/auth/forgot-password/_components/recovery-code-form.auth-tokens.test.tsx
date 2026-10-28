import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecoveryCodeForm } from './recovery-code-form'

const mockVerify = vi.fn()
vi.mock('../actions', () => ({ verifyRecoveryCode: (...a: unknown[]) => mockVerify(...a) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('RecoveryCodeForm auth tokens', () => {
  it('renders errors as a text-danger FieldError alert, never text-destructive', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'That code is invalid or has expired.' })
    const user = userEvent.setup()
    const { container } = render(<RecoveryCodeForm email="a@b.com" onRequestNewCode={vi.fn()} />)
    await user.type(screen.getByLabelText(/reset code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'field-error')
    expect(alert).toHaveClass('text-danger')
    expect(container.querySelector('.text-destructive')).toBeNull()
  })

  it('underlines Back to login and the Send a new code button', () => {
    const { container } = render(<RecoveryCodeForm email="a@b.com" onRequestNewCode={vi.fn()} />)
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveClass('underline')
    expect(screen.getByRole('button', { name: /send a new code/i })).toHaveClass('underline')
    expect(container.innerHTML).not.toMatch(
      /(red|green|blue|gray|slate)-\d|text-destructive|max-w-\[/,
    )
  })
})
