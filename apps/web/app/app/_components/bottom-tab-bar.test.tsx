import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserProvider } from './user-context'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

import { BottomTabBar } from './bottom-tab-bar'

type ObserverCallback = (entries: { contentRect: { width: number } }[]) => void
let observerCallback: ObserverCallback | null = null

function stubResizeObserver() {
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

function renderMeasured(width: number, userRole = 'student') {
  stubResizeObserver()
  const result = renderTabBar(userRole)
  act(() => observerCallback?.([{ contentRect: { width } }]))
  return result
}

function renderTabBar(userRole = 'student') {
  return render(
    <UserProvider displayName="Test User" userRole={userRole}>
      <BottomTabBar />
    </UserProvider>,
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

describe('BottomTabBar', () => {
  it('renders every student navigation tab including Settings when all fit', () => {
    renderMeasured(1000)
    for (const label of ['Dashboard', 'Quiz', 'VFR RT', 'Internal Exam', 'Reports', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })

  it('shows admin items for admin users', () => {
    renderMeasured(1000, 'admin')
    expect(screen.getByText('Syllabus')).toBeInTheDocument()
  })

  it('marks the tab matching the current pathname as the current page', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    renderMeasured(1000)
    expect(screen.getByRole('link', { name: 'Quiz' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('marks the parent tab as current when on a sub-path', () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    renderMeasured(1000)
    expect(screen.getByRole('link', { name: 'Quiz' })).toHaveAttribute('aria-current', 'page')
  })

  it('styles the active tab stronger than inactive ones', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    renderMeasured(1000)
    expect(screen.getByRole('link', { name: 'Quiz' }).className).toContain('font-medium')
    expect(screen.getByRole('link', { name: 'Dashboard' }).className).not.toContain('font-medium')
  })

  it('links point to correct routes', () => {
    renderMeasured(1000)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/app/dashboard',
    )
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/app/reports')
    expect(screen.getByRole('link', { name: 'Internal Exam' })).toHaveAttribute(
      'href',
      '/app/internal-exam',
    )
  })

  describe('when the bar is too narrow for every item', () => {
    const narrow = (width: number) => renderMeasured(width)

    it('shows a More button and moves the overflow into a sheet', async () => {
      narrow(320)
      const more = screen.getByRole('button', { name: 'More' })
      expect(more).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()

      await userEvent.setup({ delay: null }).click(more)

      expect(more).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
        'href',
        '/app/settings',
      )
      expect(more).toHaveAttribute('aria-controls', document.querySelector('ul')?.id)
    })

    it('closes the sheet on Escape', async () => {
      narrow(320)
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    })

    it('closes the sheet when tapping outside it', async () => {
      narrow(320)
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.click(screen.getByRole('button', { name: 'Close menu' }))
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    })

    it('closes the sheet after navigating', async () => {
      const { rerender } = narrow(320)
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole('button', { name: 'More' }))
      mockUsePathname.mockReturnValue('/app/settings')
      rerender(
        <UserProvider displayName="Test User" userRole="student">
          <BottomTabBar />
        </UserProvider>,
      )
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    })

    it('closes the sheet when a sheet link is tapped', async () => {
      narrow(320)
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.click(screen.getByRole('link', { name: 'Settings' }))
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    })

    it('closes the sheet when the current page link in it is tapped', async () => {
      mockUsePathname.mockReturnValue('/app/settings')
      narrow(320)
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole('button', { name: 'More' }))
      await user.click(screen.getByRole('link', { name: 'Settings' }))
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    })

    it('closes the sheet when the visible tab for the current page is tapped', async () => {
      narrow(320)
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole('button', { name: 'More' }))
      expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
      await user.click(screen.getByRole('link', { name: 'Dashboard' }))
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    })

    it('moves focus to the first sheet link when the sheet opens', async () => {
      narrow(320)
      await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'More' }))
      const first = document.querySelector('ul a')
      expect(first).not.toBeNull()
      expect(first).toHaveFocus()
    })

    it('returns focus to More after Escape closes the sheet', async () => {
      narrow(320)
      const user = userEvent.setup({ delay: null })
      const more = screen.getByRole('button', { name: 'More' })
      await user.click(more)
      await user.keyboard('{Escape}')
      expect(more).toHaveFocus()
    })

    it('returns focus to More when the sheet is closed from the keyboard via Close menu', async () => {
      narrow(320)
      const user = userEvent.setup({ delay: null })
      const more = screen.getByRole('button', { name: 'More' })
      await user.click(more)
      await user.tab({ shift: true })
      expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
      expect(more).toHaveFocus()
    })

    it('places the sheet after the More button in DOM order', async () => {
      narrow(320)
      const more = screen.getByRole('button', { name: 'More' })
      await userEvent.setup({ delay: null }).click(more)
      const sheet = document.querySelector('ul')
      expect(sheet).not.toBeNull()
      expect(
        more.compareDocumentPosition(sheet as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('stays closed after widening and narrowing again', async () => {
      narrow(320)
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole('button', { name: 'More' }))
      act(() => observerCallback?.([{ contentRect: { width: 1000 } }]))
      act(() => observerCallback?.([{ contentRect: { width: 320 } }]))
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('marks More as active when the current page is in the sheet', () => {
      mockUsePathname.mockReturnValue('/app/settings')
      narrow(320)
      expect(screen.getByRole('button', { name: 'More' }).className).not.toContain(
        'text-foreground/55',
      )
    })

    it('leaves More inactive when the current page is visible', () => {
      narrow(320)
      expect(screen.getByRole('button', { name: 'More' }).className).toContain('text-foreground/55')
    })
  })
})
