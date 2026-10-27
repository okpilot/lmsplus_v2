import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('closes the sheet on a route change while the role is resolving', async () => {
    stubWideTabBar()
    let resolve: (u: ShellUser) => void = () => {}
    const pending = new Promise<ShellUser>((r) => {
      resolve = r
    })
    let view!: ReturnType<typeof renderMobileNav>
    await act(async () => {
      view = renderMobileNav(pending)
    })
    await act(async () => observerCallback?.([{ contentRect: { width: 256 } }]))
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'More' }))
    await act(async () => {
      mockUsePathname.mockReturnValue('/app/quiz')
      view.rerender(
        <UserProvider user={pending}>
          <MobileNav />
        </UserProvider>,
      )
      resolve({ displayName: 'A', userRole: 'admin' })
      await pending
    })
    act(() => observerCallback?.([{ contentRect: { width: 256 } }]))
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
  })

  describe('when the role resolves', () => {
    async function renderPending(width: number) {
      stubWideTabBar()
      let resolve: (u: ShellUser) => void = () => {}
      const pending = new Promise<ShellUser>((r) => {
        resolve = r
      })
      await act(async () => {
        renderMobileNav(pending)
      })
      act(() => observerCallback?.([{ contentRect: { width } }]))
      return async (userRole: string) => {
        await act(async () => {
          resolve({ displayName: 'A', userRole })
          await pending
        })
      }
    }

    it('keeps the same tab bar element', async () => {
      const resolveAs = await renderPending(256)
      const nav = screen.getByRole('navigation', { name: 'Bottom navigation' })
      await resolveAs('admin')
      expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBe(nav)
    })

    it('keeps keyboard focus on More', async () => {
      const resolveAs = await renderPending(256)
      act(() => screen.getByRole('button', { name: 'More' }).focus())
      await resolveAs('admin')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More' }))
    })

    it('keeps the measured tab count without re-measuring', async () => {
      const resolveAs = await renderPending(1000)
      await resolveAs('student')
      expect(screen.getByText('Settings')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
    })
  })

  describe('when the role resolves while the More sheet is open', () => {
    async function openSheetThenResolve() {
      stubWideTabBar()
      let resolve: (u: ShellUser) => void = () => {}
      const pending = new Promise<ShellUser>((r) => {
        resolve = r
      })
      let view!: ReturnType<typeof renderMobileNav>
      await act(async () => {
        view = renderMobileNav(pending)
      })
      await act(async () => observerCallback?.([{ contentRect: { width: 256 } }]))
      await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'More' }))
      expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true')
      await act(async () => {
        resolve({ displayName: 'A', userRole: 'admin' })
        await pending
      })
      act(() => observerCallback?.([{ contentRect: { width: 256 } }]))
      return view
    }

    it('keeps the sheet open', async () => {
      await openSheetThenResolve()
      expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument()
    })

    it('still closes the sheet on a later route change', async () => {
      const { rerender } = await openSheetThenResolve()
      mockUsePathname.mockReturnValue('/app/quiz')
      rerender(
        <UserProvider user={fulfilled({ displayName: 'A', userRole: 'admin' })}>
          <MobileNav />
        </UserProvider>,
      )
      expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
    })
  })
})
