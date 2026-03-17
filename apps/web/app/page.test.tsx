import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from './page'

// LoginForm has its own test file. Here we only verify the page maps error
// codes correctly and passes initialError down — not the form internals.
vi.mock('./_components/login-form', () => ({
  LoginForm: ({ initialError }: { initialError?: string }) => (
    <div data-testid="login-form" data-initial-error={initialError ?? ''} />
  ),
}))

async function renderPage(searchParams: Record<string, string> = {}) {
  const jsx = await LoginPage({ searchParams: Promise.resolve(searchParams) })
  render(jsx)
}

describe('LoginPage', () => {
  it('renders without an error banner when no search param is present', async () => {
    await renderPage()
    const form = screen.getByTestId('login-form')
    expect(form.dataset.initialError).toBe('')
  })

  it('maps missing_code to the correct human-readable message', async () => {
    await renderPage({ error: 'missing_code' })
    expect(screen.getByTestId('login-form').dataset.initialError).toBe(
      'The sign-in link is invalid. Please try again.',
    )
  })

  it('maps invalid_code to the correct human-readable message', async () => {
    await renderPage({ error: 'invalid_code' })
    expect(screen.getByTestId('login-form').dataset.initialError).toBe(
      'The sign-in link has expired or already been used.',
    )
  })

  it('maps not_registered to the correct human-readable message', async () => {
    await renderPage({ error: 'not_registered' })
    expect(screen.getByTestId('login-form').dataset.initialError).toBe(
      'Your account has not been set up yet. Please contact your flight school administrator.',
    )
  })

  it('maps profile_lookup_failed to the correct human-readable message', async () => {
    await renderPage({ error: 'profile_lookup_failed' })
    expect(screen.getByTestId('login-form').dataset.initialError).toBe(
      'We could not verify your account right now. Please try again.',
    )
  })

  it('maps auth_failed to the correct human-readable message', async () => {
    await renderPage({ error: 'auth_failed' })
    expect(screen.getByTestId('login-form').dataset.initialError).toBe(
      'Authentication failed. Please try again.',
    )
  })

  it('falls back to a generic message for an unrecognised error code', async () => {
    await renderPage({ error: 'totally_unknown_code' })
    expect(screen.getByTestId('login-form').dataset.initialError).toBe(
      'Something went wrong. Please try again.',
    )
  })

  it('renders the LMS Plus heading', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /lms plus/i })).toBeInTheDocument()
  })
})
