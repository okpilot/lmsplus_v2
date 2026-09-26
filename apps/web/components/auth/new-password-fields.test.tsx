import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NewPasswordFields } from './new-password-fields'

function Harness() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  return (
    <NewPasswordFields
      password={password}
      confirmPassword={confirmPassword}
      onPasswordChange={setPassword}
      onConfirmPasswordChange={setConfirmPassword}
    />
  )
}

describe('NewPasswordFields', () => {
  it('renders password and confirm password inputs', () => {
    render(<Harness />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('calls the change handlers when typing in each field', async () => {
    const onPasswordChange = vi.fn()
    const onConfirmPasswordChange = vi.fn()
    const user = userEvent.setup()
    render(
      <NewPasswordFields
        password=""
        confirmPassword=""
        onPasswordChange={onPasswordChange}
        onConfirmPasswordChange={onConfirmPasswordChange}
      />,
    )

    await user.type(screen.getByLabelText(/new password/i), 'a')
    await user.type(screen.getByLabelText(/confirm password/i), 'b')

    expect(onPasswordChange).toHaveBeenCalledWith('a')
    expect(onConfirmPasswordChange).toHaveBeenCalledWith('b')
  })

  it('toggling visibility switches both password inputs to text at once', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const passwordInput = screen.getByLabelText(/new password/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(confirmInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))

    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(confirmInput).toHaveAttribute('type', 'text')
  })
})
