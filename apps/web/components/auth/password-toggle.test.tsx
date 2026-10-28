import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordToggle } from './password-toggle'

describe('PasswordToggle', () => {
  it('renders a round button labelled "Show password" when hidden', () => {
    const { container } = render(<PasswordToggle shown={false} onToggle={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Show password' })
    expect(btn).toHaveAttribute('data-slot', 'button')
    expect(btn).toHaveClass('rounded-full')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('labels "Hide password" with aria-pressed true when shown', () => {
    render(<PasswordToggle shown onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
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
