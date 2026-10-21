import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignOutButton } from './sign-out-button'

const mockSignOut = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }))
const mockAssign = vi.fn()
const originalLocation = window.location

vi.mock('@repo/db/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}))

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({})
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: mockAssign },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('renders a sign out button', () => {
    render(<SignOutButton />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls Supabase signOut when clicked', async () => {
    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('loads the login page as a full document navigation after signing out', async () => {
    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await vi.waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/')
    })
  })

  it('navigates only after sign-out completes', async () => {
    let resolveSignOut!: (value: { error: null }) => void
    mockSignOut.mockReturnValue(
      new Promise<{ error: null }>((resolve) => {
        resolveSignOut = resolve
      }),
    )

    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(mockAssign).not.toHaveBeenCalled()

    resolveSignOut({ error: null })
    await vi.waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/')
    })
  })

  it('signs out and navigates from the sidebar row variant too', async () => {
    const user = userEvent.setup()
    render(<SignOutButton variant="row" />)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(mockSignOut).toHaveBeenCalledOnce()
    await vi.waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/')
    })
  })

  it('signs out and navigates once when clicked twice while sign-out is pending', async () => {
    let resolveSignOut!: (value: { error: null }) => void
    mockSignOut.mockReturnValue(
      new Promise<{ error: null }>((resolve) => {
        resolveSignOut = resolve
      }),
    )

    const user = userEvent.setup()
    render(<SignOutButton />)

    const button = screen.getByRole('button', { name: /sign out/i })
    await user.click(button)
    await user.click(button)

    resolveSignOut({ error: null })
    await vi.waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/')
    })
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockAssign).toHaveBeenCalledOnce()
  })

  it('stays on the page when sign-out throws and allows a retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSignOut.mockRejectedValueOnce(new Error('network down'))

    const user = userEvent.setup()
    render(<SignOutButton />)

    const button = screen.getByRole('button', { name: /sign out/i })
    await user.click(button)
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalled()
    })
    expect(mockAssign).not.toHaveBeenCalled()

    await user.click(button)

    expect(mockSignOut).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/')
    })
  })

  it('shows an error toast and stays on the page when sign-out resolves with an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSignOut.mockResolvedValueOnce({ error: { message: 'x' } })

    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await vi.waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Sign-out failed. Please try again.')
    })
    expect(consoleError).toHaveBeenCalled()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('signs out again on a second click after a returned sign-out error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSignOut.mockResolvedValueOnce({ error: { message: 'x' } })

    const user = userEvent.setup()
    render(<SignOutButton />)

    const button = screen.getByRole('button', { name: /sign out/i })
    await user.click(button)
    await vi.waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })
    await user.click(button)

    expect(mockSignOut).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('/')
    })
  })

  it('disables the button while sign-out is pending', async () => {
    mockSignOut.mockReturnValue(new Promise(() => {}))

    const user = userEvent.setup()
    render(<SignOutButton />)

    const button = screen.getByRole('button', { name: /sign out/i })
    await user.click(button)

    expect(button).toBeDisabled()
  })
})
