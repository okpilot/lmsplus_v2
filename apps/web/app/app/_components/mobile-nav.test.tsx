import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellUser } from '../_lib/shell-user'
import { UserProvider } from './user-context'

const fulfilled = <T,>(v: T) =>
  Object.assign(Promise.resolve(v), { status: 'fulfilled' as const, value: v })

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

import { MobileNav } from './mobile-nav'

type ObserverCallback = (entries: { contentRect: { width: number } }[]) => void
let observerCallback: ObserverCallback | null = null

function stubWideTabBar() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ObserverCallback) {
        observerCallback = cb
      }
      observe() {}
      disconnect() {}
    },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  observerCallback = null
  mockUsePathname.mockReturnValue('/app/dashboard')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderMobileNav(
  user: Promise<ShellUser> = fulfilled({ displayName: 'Test', userRole: 'student' }),
) {
  return render(
    <UserProvider user={user}>
      <MobileNav />
    </UserProvider>,
  )
}

describe('MobileNav', () => {
  it('renders the bottom tab bar with navigation links', () => {
    renderMobileNav()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('highlights the active tab matching the current pathname', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    renderMobileNav()
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink).toHaveAttribute('aria-current', 'page')
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink).not.toHaveAttribute('aria-current')
  })

  it('shows the generic tab bar while the user is still loading', () => {
    renderMobileNav(new Promise(() => {}))
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument()
  })

  it('adds the admin tabs for admins once the user has resolved', () => {
    stubWideTabBar()
    renderMobileNav(fulfilled({ displayName: 'Test', userRole: 'admin' }))
    act(() => observerCallback?.([{ contentRect: { width: 1000 } }]))
    expect(screen.getByText('Syllabus')).toBeInTheDocument()
  })

  it('shows no admin tabs for students once the user has resolved', () => {
    stubWideTabBar()
    renderMobileNav()
    act(() => observerCallback?.([{ contentRect: { width: 1000 } }]))
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
  })
})
