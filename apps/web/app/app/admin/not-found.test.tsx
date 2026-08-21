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

import AdminNotFound from './not-found'

describe('AdminNotFound', () => {
  it('tells the admin the record does not exist', () => {
    render(<AdminNotFound />)
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })

  it('returns the admin to the admin dashboard, not the student one', () => {
    render(<AdminNotFound />)
    expect(screen.getByRole('link', { name: 'Back to admin dashboard' })).toHaveAttribute(
      'href',
      '/app/admin/dashboard',
    )
  })
})
