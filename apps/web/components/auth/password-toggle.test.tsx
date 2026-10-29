import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordToggle } from './password-toggle'

describe('PasswordToggle', () => {
  it('renders a round button labelled "Show password" when hidden', () => {
    const { container } = render(<PasswordToggle shown={false} onToggle={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Show password' })
    expect(btn).toHaveAttribute('data-slot', 'button')
    expect(btn).toHaveClass('rounded-pill')
    expect(btn).not.toHaveAttribute('aria-pressed')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('centres without a translate so the pressed nudge cannot un-centre it', () => {
    render(<PasswordToggle shown={false} onToggle={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Show password' })
    expect(btn).toHaveClass('inset-y-0', 'my-auto')
    expect(btn.className).not.toContain('-translate-y-1/2')
  })

  it('labels "Hide password" with no pressed state when shown', () => {
    render(<PasswordToggle shown onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Hide password' })).not.toHaveAttribute(
      'aria-pressed',
    )
  })

  it('uses a custom label', () => {
    const { rerender } = render(
      <PasswordToggle shown={false} onToggle={vi.fn()} label="passwords" />,
    )
    expect(screen.getByRole('button', { name: 'Show passwords' })).toBeInTheDocument()
    rerender(<PasswordToggle shown onToggle={vi.fn()} label="passwords" />)
    expect(screen.getByRole('button', { name: 'Hide passwords' })).toBeInTheDocument()
  })

  it('calls onToggle on click', async () => {
    const onToggle = vi.fn()
    render(<PasswordToggle shown={false} onToggle={onToggle} />)
    await userEvent.setup().click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
