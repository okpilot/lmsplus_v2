import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetPasswordForm } from './reset-password-form'

const mockUpdateUser = vi.fn()
vi.mock('@repo/db/client', () => ({
  createClient: () => ({
    auth: {
      updateUser: mockUpdateUser,
    },
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const assignedHrefs: string[] = []
Object.defineProperty(window, 'location', {
  configurable: true,
  value: {
    origin: 'http://localhost:3000',
    get href() {
      return assignedHrefs[assignedHrefs.length - 1] ?? 'http://localhost:3000/'
    },
    set href(val: string) {
      assignedHrefs.push(val)
    },
  },
})

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assignedHrefs.length = 0
  })

  it('renders password and confirm password inputs', () => {
    render(<ResetPasswordForm />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })

  it('shows an error when password is too short', async () => {
    render(<ResetPasswordForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'ab')
    await user.type(screen.getByLabelText(/confirm password/i), 'ab')
    const form = screen
      .getByRole('button', { name: /update password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('shows an error when passwords do not match', async () => {
    render(<ResetPasswordForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/new password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'different456')
    const form = screen
      .getByRole('button', { name: /update password/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('calls updateUser with matching passwords and redirects to dashboard', async () => {
    mockUpdateUser.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
      expect(assignedHrefs).toContain('/app/dashboard')
    })
  })

  it('shows an error when updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({ error: { message: 'fail' } })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/unable to update password/i)).toBeInTheDocument()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    const passwordInput = screen.getByLabelText(/new password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')
  })
})
