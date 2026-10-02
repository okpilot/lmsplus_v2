import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))
vi.mock('@repo/db/client', () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}))

import { SidebarFooter } from './sidebar-footer'

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

describe('SidebarFooter', () => {
  it('renders Settings, theme, sign out and the user chip', () => {
    render(<SidebarFooter displayName="Ada Pilot" />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings')
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByText('Ada Pilot')).toBeInTheDocument()
  })

  it('places the user chip last', () => {
    render(<SidebarFooter displayName="Ada Pilot" />)
    const chip = screen.getByText('Ada Pilot').parentElement
    expect(chip?.parentElement?.lastElementChild).toBe(chip)
  })

  it('marks Settings as the current page on the settings route', () => {
    mockUsePathname.mockReturnValue('/app/settings')
    render(<SidebarFooter displayName="Ada Pilot" />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not mark Settings current elsewhere', () => {
    render(<SidebarFooter displayName="Ada Pilot" />)
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })
})
