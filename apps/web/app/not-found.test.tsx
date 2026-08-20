import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetAllMocks()
})

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import NotFound from './not-found'

describe('NotFound', () => {
  it('tells the visitor the page does not exist', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('offers a way out that works for signed-out visitors', () => {
    // `/`, not a dashboard: this boundary is reachable while logged out, and an
    // authenticated visitor is forwarded on from `/` by the proxy.
    render(<NotFound />)
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/')
  })
})
