import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: '1' }) }),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))
vi.mock('./_components/reset-password-form', () => ({
  ResetPasswordForm: () => <div data-testid="reset-form" />,
}))

import ResetPasswordPage from './page'

describe('ResetPasswordPage', () => {
  it('renders inside AuthShell: a card and the LMS Plus h1', async () => {
    render(await ResetPasswordPage())
    expect(document.querySelector('[data-slot=card]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'LMS Plus' })).toBeInTheDocument()
    expect(screen.getByTestId('reset-form')).toBeInTheDocument()
  })
})
