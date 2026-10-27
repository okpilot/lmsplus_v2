import { render, screen, within } from '@testing-library/react'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn<() => string>() }))

vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('./sidebar-footer', () => ({ SidebarFooter: () => <div data-testid="sidebar-footer" /> }))

import { SidebarNav } from './sidebar-nav'
import { UserProvider } from './user-context'

const fulfilled = <T,>(v: T) =>
  Object.assign(Promise.resolve(v), { status: 'fulfilled' as const, value: v })

function renderNav(user: Promise<unknown>) {
  render(
    <UserProvider user={user as never}>
      <Suspense fallback={null}>
        <SidebarNav />
      </Suspense>
    </UserProvider>,
  )
  return screen.getByRole('navigation', { name: 'Main navigation' })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

describe('SidebarNav VFR RT gating', () => {
  it('hides VFR RT for a PPL-only student', () => {
    const nav = renderNav(
      fulfilled({ displayName: 'A', userRole: 'student', courseCodes: ['PPL_A'] }),
    )
    expect(within(nav).queryByRole('link', { name: 'VFR RT' })).not.toBeInTheDocument()
    expect(within(nav).getByTestId('vfr-rt-nav-ready')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Quiz' })).toBeInTheDocument()
  })

  it('shows VFR RT for a PPL + RT student', () => {
    const nav = renderNav(
      fulfilled({ displayName: 'A', userRole: 'student', courseCodes: ['PPL_A', 'VFR_RT'] }),
    )
    expect(within(nav).getByRole('link', { name: 'VFR RT' })).toBeInTheDocument()
  })

  it.each(['admin', 'instructor'])('shows VFR RT for %s', (userRole) => {
    const nav = renderNav(fulfilled({ displayName: 'A', userRole, courseCodes: null }))
    expect(within(nav).getByRole('link', { name: 'VFR RT' })).toBeInTheDocument()
  })

  it('hides VFR RT while the user is pending but renders other items', () => {
    const nav = renderNav(new Promise<never>(() => {}))
    expect(within(nav).queryByRole('link', { name: 'VFR RT' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Quiz' })).toBeInTheDocument()
  })
})
