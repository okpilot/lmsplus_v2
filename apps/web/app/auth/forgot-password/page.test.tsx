import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./_components/forgot-password-form', () => ({
  ForgotPasswordForm: () => <div data-testid="forgot-form" />,
}))

import ForgotPasswordPage from './page'

describe('ForgotPasswordPage', () => {
  it('renders inside AuthShell: a card and the LMS Plus h1', () => {
    render(<ForgotPasswordPage />)
    expect(document.querySelector('[data-slot=card]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'LMS Plus' })).toBeInTheDocument()
    expect(screen.getByTestId('forgot-form')).toBeInTheDocument()
  })
})
