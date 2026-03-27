import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './login-form'

// Mock the Supabase client module
const mockSignInWithPassword = vi.fn()
vi.mock('@repo/db/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  }),
}))

// Mock next/link to render a plain <a>
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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

  it('renders email and password inputs with a submit button', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows a validation error when submitting with an invalid email', async () => {
    render(<LoginForm />)
    const form = screen.getByRole('button', { name: /sign in/i }).closest('form') as HTMLFormElement
    const emailInput = screen.getByLabelText(/email address/i)
    await userEvent.setup().type(emailInput, 'not-an-email')
    fireEvent.submit(form)

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('shows a validation error when password is empty', async () => {
    render(<LoginForm />)
    const form = screen.getByRole('button', { name: /sign in/i }).closest('form') as HTMLFormElement
    const emailInput = screen.getByLabelText(/email address/i)
    await userEvent.setup().type(emailInput, 'pilot@example.com')
    fireEvent.submit(form)

    expect(await screen.findByText(/password is required/i)).toBeInTheDocument()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('calls signInWithPassword with email and password on valid submit', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'pilot@example.com',
        password: 'secret123',
      })
    })
  })

  it('redirects to /auth/login-complete after successful sign-in', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(assignedHrefs).toContain('/auth/login-complete')
    })
  })

  it('shows a loading state while the sign-in request is in flight', async () => {
    mockSignInWithPassword.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled()
  })

  it('maps "Invalid login credentials" to a friendly error', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument()
  })

  it('shows a generic fallback for unknown auth errors', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Something unexpected' } })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'test')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/unable to sign in/i)).toBeInTheDocument()
  })

  it('re-enables the submit button after a failed sign-in', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'fail' } })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'test')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
    })
  })

  it('toggles password visibility when clicking the eye icon', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    const passwordInput = screen.getByLabelText(/^password$/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('displays initialError prop when provided', () => {
    render(<LoginForm initialError="Your account is not registered." />)
    expect(screen.getByText('Your account is not registered.')).toBeInTheDocument()
  })

  it('renders a "Forgot password?" link to /auth/forgot-password', () => {
    render(<LoginForm />)
    const link = screen.getByRole('link', { name: /forgot password/i })
    expect(link).toHaveAttribute('href', '/auth/forgot-password')
  })

  it('renders a "Terms of Service" link to /legal/terms', () => {
    render(<LoginForm />)
    const link = screen.getByRole('link', { name: /terms of service/i })
    expect(link).toHaveAttribute('href', '/legal/terms')
  })

  it('renders a "Privacy Policy" link to /legal/privacy', () => {
    render(<LoginForm />)
    const link = screen.getByRole('link', { name: /privacy policy/i })
    expect(link).toHaveAttribute('href', '/legal/privacy')
  })

  it('maps "Email rate limit exceeded" to a friendly error', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Email rate limit exceeded' },
    })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument()
  })

  it('shows a generic error when signInWithPassword throws an exception', async () => {
    mockSignInWithPassword.mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText(/email address/i), 'pilot@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/unable to sign in/i)).toBeInTheDocument()
  })
})
