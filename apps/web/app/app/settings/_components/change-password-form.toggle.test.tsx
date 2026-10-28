import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../password-actions', () => ({ changePassword: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ChangePasswordForm } from './change-password-form'

describe('ChangePasswordForm toggle', () => {
  it('uses a data-slot=button toggle that flips every input type', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)
    const toggle = screen.getByRole('button', { name: 'Show passwords' })
    expect(toggle).toHaveAttribute('data-slot', 'button')
    await user.click(toggle)
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide passwords' })).toBeInTheDocument()
  })
})
