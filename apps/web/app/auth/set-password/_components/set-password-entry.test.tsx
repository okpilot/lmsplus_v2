import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./set-password-form', () => ({
  SetPasswordForm: ({ tokenHash }: { tokenHash: string }) => (
    <div data-testid="set-password-form">{tokenHash}</div>
  ),
}))

vi.mock('./link-unavailable', () => ({
  LinkUnavailable: ({ reason }: { reason: string }) => (
    <div data-testid="link-unavailable">{reason}</div>
  ),
}))

import { SetPasswordEntry } from './set-password-entry'

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

describe('SetPasswordEntry', () => {
  it('renders the form for a well-formed recovery link', () => {
    render(<SetPasswordEntry tokenHash={HASH} type="recovery" />)

    expect(screen.getByTestId('set-password-form')).toHaveTextContent(HASH)
    expect(screen.queryByTestId('link-unavailable')).not.toBeInTheDocument()
  })

  it.each([
    ['no params', {}],
    ['a missing token', { type: 'recovery' }],
    ['a malformed token', { tokenHash: 'nope', type: 'recovery' }],
    ['a wrong type', { tokenHash: HASH, type: 'signup' }],
  ])('shows the link-unavailable panel for %s', (_label, props) => {
    render(<SetPasswordEntry {...props} />)

    expect(screen.getByTestId('link-unavailable')).toHaveTextContent('missing')
    expect(screen.queryByTestId('set-password-form')).not.toBeInTheDocument()
  })
})
