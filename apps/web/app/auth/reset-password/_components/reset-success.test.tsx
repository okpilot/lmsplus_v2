import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResetSuccess } from './reset-success'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('ResetSuccess', () => {
  it('underlines the sign-in link', () => {
    const { container } = render(<ResetSuccess />)
    expect(screen.getByRole('link', { name: /sign in with your new password/i })).toHaveClass(
      'underline',
    )
    expect(container.innerHTML).not.toMatch(
      /(red|green|blue|gray|slate)-\d|text-destructive|max-w-\[/,
    )
  })
})
