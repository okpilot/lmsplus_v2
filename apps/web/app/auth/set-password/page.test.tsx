import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))

vi.mock('@repo/db/server', () => ({ createServerSupabaseClient: mockCreateClient }))

vi.mock('./_components/set-password-form', () => ({
  SetPasswordForm: ({ tokenHash }: { tokenHash: string }) => (
    <div data-testid="set-password-form">{tokenHash}</div>
  ),
}))

vi.mock('./_components/link-unavailable', () => ({
  LinkUnavailable: ({ reason }: { reason: string }) => (
    <div data-testid="link-unavailable">{reason}</div>
  ),
}))

import SetPasswordPage from './page'

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

async function renderPage(params: { token_hash?: string; type?: string }) {
  render(await SetPasswordPage({ searchParams: Promise.resolve(params) }))
}

describe('SetPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the form for a well-formed recovery link', async () => {
    await renderPage({ token_hash: HASH, type: 'recovery' })

    expect(screen.getByTestId('set-password-form')).toHaveTextContent(HASH)
  })

  it('consumes nothing on GET: no Supabase client is created', async () => {
    await renderPage({ token_hash: HASH, type: 'recovery' })

    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('shows the link-unavailable panel for a malformed token', async () => {
    await renderPage({ token_hash: 'nope', type: 'recovery' })

    expect(screen.getByTestId('link-unavailable')).toHaveTextContent('missing')
    expect(screen.queryByTestId('set-password-form')).not.toBeInTheDocument()
  })
})
