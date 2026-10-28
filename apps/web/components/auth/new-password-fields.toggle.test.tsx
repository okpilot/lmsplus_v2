import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NewPasswordFields } from './new-password-fields'

describe('NewPasswordFields toggle', () => {
  it('uses a data-slot=button toggle that flips the input type', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <NewPasswordFields
        password=""
        confirmPassword=""
        onPasswordChange={() => {}}
        onConfirmPasswordChange={() => {}}
      />,
    )
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('data-slot', 'button')
    await user.click(toggle)
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('type', 'password')
    expect(container.innerHTML).not.toMatch(
      /(red|green|blue|gray|slate)-\d|text-destructive|max-w-\[/,
    )
  })
})
