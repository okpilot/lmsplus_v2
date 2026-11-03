import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./sign-out-button', () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}))
vi.mock('./theme-toggle', () => ({
  ThemeToggle: () => <button type="button">Toggle theme</button>,
}))

import { PhoneTopBar } from './phone-top-bar'

describe('PhoneTopBar', () => {
  it('shows the wordmark, theme toggle and sign out', () => {
    render(<PhoneTopBar />)
    expect(screen.getByRole('link', { name: 'lmsplus home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('is hidden from the sm breakpoint up and adds no landmark', () => {
    const { container } = render(<PhoneTopBar />)
    expect((container.firstElementChild as HTMLElement).className).toContain('sm:hidden')
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('uses the border token for its bottom edge', () => {
    const { container } = render(<PhoneTopBar />)
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('border-border')
    expect(cls).not.toContain('border-foreground/')
  })
})
