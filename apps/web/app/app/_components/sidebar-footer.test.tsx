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
import { UserProvider } from './user-context'

const fulfilled = <T,>(v: T) =>
  Object.assign(Promise.resolve(v), { status: 'fulfilled' as const, value: v })

function renderFooter(
  user: Promise<{ displayName: string; userRole: string }> = fulfilled({
    displayName: 'Ada Pilot',
    userRole: 'student',
  }),
) {
  return render(
    <UserProvider user={user}>
      <SidebarFooter />
    </UserProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

describe('SidebarFooter', () => {
  it('renders Settings, theme, sign out and the user chip', () => {
    renderFooter()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings')
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByText('Ada Pilot')).toBeInTheDocument()
  })

  it('places the user chip last', () => {
    renderFooter()
    const chip = screen.getByText('Ada Pilot').parentElement
    expect(chip?.parentElement?.lastElementChild).toBe(chip)
  })

  it('marks Settings as the current page on the settings route', () => {
    mockUsePathname.mockReturnValue('/app/settings')
    renderFooter()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not mark Settings current elsewhere', () => {
    renderFooter()
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })

  it('shows a loading placeholder while the name is not known yet', () => {
    renderFooter(new Promise(() => {}))
    expect(screen.getByText('Loading account')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('uses the border token for its top edge', () => {
    const { container } = renderFooter()
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('border-border')
    expect(container.innerHTML).not.toContain('border-foreground/')
  })
})
