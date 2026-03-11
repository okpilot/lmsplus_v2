import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignOutButton } from './sign-out-button'

const mockSignOut = vi.fn()
const mockRouterPush = vi.fn()

vi.mock('@repo/db/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({})
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

  it('redirects to the login page after signing out', async () => {
    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    // Wait for async handler
    await vi.waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/')
    })
  })

  it('redirects only after sign-out completes', async () => {
    // Simulate a slow sign-out
    let resolveSignOut!: () => void
    mockSignOut.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignOut = resolve
      }),
    )

    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    // Router should not have been called yet
    expect(mockRouterPush).not.toHaveBeenCalled()

    resolveSignOut()
    await vi.waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/')
    })
  })
})
