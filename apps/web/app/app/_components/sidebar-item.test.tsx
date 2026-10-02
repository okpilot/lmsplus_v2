import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RowIcon, SidebarItem } from './sidebar-item'

const ITEM = { href: '/app/quiz', label: 'Quiz', icon: 'file-question' } as const

describe('SidebarItem', () => {
  it('marks an active item as the current page with the surface style', () => {
    render(<SidebarItem item={ITEM} active />)
    const link = screen.getByRole('link', { name: 'Quiz' })
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link.className).toContain('bg-surface')
  })

  it('renders an inactive item without current-page state', () => {
    render(<SidebarItem item={ITEM} active={false} />)
    const link = screen.getByRole('link', { name: 'Quiz' })
    expect(link).not.toHaveAttribute('aria-current')
    expect(link.className).not.toContain('bg-surface')
  })
})

describe('RowIcon', () => {
  it('renders one path per entry as a decorative icon', () => {
    const { container } = render(<RowIcon paths={['M0 0', 'M1 1']} />)
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
