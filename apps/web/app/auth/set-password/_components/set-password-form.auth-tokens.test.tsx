import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SetPasswordForm } from './set-password-form'

const mockSet = vi.fn()
vi.mock('../actions', () => ({ setPasswordFromLink: (...a: unknown[]) => mockSet(...a) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

async function fail(result: Record<string, unknown>) {
  mockSet.mockResolvedValue(result)
  const user = userEvent.setup()
  const utils = render(<SetPasswordForm tokenHash={HASH} />)
  await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
  await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
  await user.click(screen.getByRole('button', { name: /set password/i }))
  return utils
}

describe('SetPasswordForm auth tokens', () => {
  it('renders errors as a text-danger FieldError alert, never text-destructive', async () => {
    const { container } = await fail({ success: false, error: 'Choose a different password.' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'field-error')
    expect(alert).toHaveClass('text-danger')
    expect(container.querySelector('.text-destructive')).toBeNull()
  })

  it('renders Continue as a full-width buttonVariants link without rounded-lg', async () => {
    const { container } = await fail({
      success: false,
      error: 'Too weak.',
      redirectTo: '/auth/reset-password',
    })
    const link = await screen.findByRole('link', { name: /continue/i })
    expect(link).toHaveAttribute('href', '/auth/reset-password')
    expect(link).toHaveClass('bg-primary', 'w-full')
    expect(link.className).not.toContain('rounded-lg')
    expect(container.innerHTML).not.toMatch(
      /(red|green|blue|gray|slate)-\d|text-destructive|max-w-\[/,
    )
  })
})
