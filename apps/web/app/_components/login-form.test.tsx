import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './login-form'

// Mock the Supabase client module
const mockSignInWithOtp = vi.fn()
vi.mock('@repo/db/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  }),
}))

// jsdom's window.location is not fully writable, so we track href via a custom getter/setter.
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

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assignedHrefs.length = 0
  })

  it('renders an email input and a submit button', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send magic link/i })).toBeInTheDocument()
  })

  it('enables the submit button after hydration completes', () => {
    // The component uses a useEffect to set hydrated=true after mount.
    // @testing-library/react wraps render() in act(), which flushes all effects
    // synchronously, so the button must be enabled by the time render() returns.
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /send magic link/i })).not.toBeDisabled()
  })

  it('shows a validation error when submitting with an invalid email', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email')
    // Use fireEvent.submit to bypass jsdom's type="email" constraint validation
    // (we're testing our Zod validation, not browser built-in validation)
    // Form element guaranteed to exist — button is inside the form we rendered
    const form = screen
      .getByRole('button', { name: /send magic link/i })
      .closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument()
    expect(mockSignInWithOtp).not.toHaveBeenCalled()
  })

  it('shows a validation error when submitting an empty email field', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    // Type then clear to avoid the HTML5 `required` short-circuit in jsdom
    const input = screen.getByLabelText(/email address/i)
    await user.type(input, 'a')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    // Zod .email() rejects an empty string
    await waitFor(() => {
      expect(mockSignInWithOtp).not.toHaveBeenCalled()
    })
  })

  it('calls Supabase signInWithOtp with the entered email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'pilot@example.com' }),
      )
    })
  })

  it('includes the auth callback redirect URL in the OTP options', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: expect.stringContaining('/auth/callback'),
          }),
        }),
      )
    })
  })

  it('shows a loading state while the OTP request is in flight', async () => {
    // Never resolves so we can inspect the loading state mid-request
    mockSignInWithOtp.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    expect(await screen.findByRole('button', { name: /sending link/i })).toBeDisabled()
  })

  it('redirects to /auth/verify after a successful OTP request', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => {
      expect(assignedHrefs).toContain('/auth/verify')
    })
  })

  it('shows the Supabase error message when the OTP request fails', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Rate limit exceeded' } })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    expect(await screen.findByText(/rate limit exceeded/i)).toBeInTheDocument()
    expect(assignedHrefs).toHaveLength(0)
  })

  it('re-enables the submit button after a failed OTP request', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Something went wrong' } })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.click(screen.getByRole('button', { name: /send magic link/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send magic link/i })).not.toBeDisabled()
    })
  })
})
