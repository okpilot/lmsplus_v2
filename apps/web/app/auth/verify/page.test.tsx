import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import VerifyPage from './page'

// next/link renders a plain <a> in test environments
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

async function renderPage(error?: string) {
  const searchParams = Promise.resolve(error ? { error } : {})
  const jsx = await VerifyPage({ searchParams })
  render(jsx)
}

describe('VerifyPage', () => {
  it('shows the "check your email" confirmation when there is no error', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    expect(screen.getByText(/we sent you a magic link/i)).toBeInTheDocument()
  })

  it('shows a "try again" link back to login when there is no error', async () => {
    await renderPage()
    expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute('href', '/')
  })

  it('shows the error heading when error=missing_code', async () => {
    await renderPage('missing_code')
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText(/the magic link is invalid/i)).toBeInTheDocument()
  })

  it('shows the error heading when error=invalid_code', async () => {
    await renderPage('invalid_code')
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText(/expired or already been used/i)).toBeInTheDocument()
  })

  it('shows the not-registered message when error=not_registered', async () => {
    await renderPage('not_registered')
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText(/contact your flight school administrator/i)).toBeInTheDocument()
  })

  it('shows a "back to login" link when there is an error', async () => {
    await renderPage('missing_code')
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/')
  })

  it('does not show the check-your-email content when there is an error', async () => {
    await renderPage('invalid_code')
    expect(screen.queryByText(/we sent you a magic link/i)).not.toBeInTheDocument()
  })

  it('shows nothing recognisable when given an unknown error code', async () => {
    await renderPage('unknown_error_code')
    // No matching ERROR_MESSAGES entry → errorMessage is undefined → no error heading
    expect(screen.queryByRole('heading', { name: /something went wrong/i })).not.toBeInTheDocument()
    // Falls through to the success / check-email branch
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument()
  })
})
