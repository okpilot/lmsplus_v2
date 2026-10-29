import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ROW_CLASS, RowIcon, SidebarItem } from './sidebar-item'

const ITEM = { href: '/app/quiz', label: 'Quiz', icon: 'file-question' } as const

describe('SidebarItem', () => {
  it('marks an active item as the current page with a soft blue fill and blue text', () => {
    render(<SidebarItem item={ITEM} active />)
    const link = screen.getByRole('link', { name: 'Quiz' })
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link.className).toContain('bg-primary-soft')
    expect(link.className).toContain('text-primary-text')
    expect(link.className).toContain('font-medium')
    expect(link.className).not.toContain('bg-card')
    expect(link.className).not.toContain('ring-1')
  })

  it('renders an inactive item grey without current-page state or opacity', () => {
    render(<SidebarItem item={ITEM} active={false} />)
    const link = screen.getByRole('link', { name: 'Quiz' })
    expect(link).not.toHaveAttribute('aria-current')
    expect(link.className).toContain('text-muted-foreground')
    expect(link.className).not.toContain('bg-primary-soft')
    expect(link.className).not.toContain('text-foreground/65')
    expect(link.querySelector('.opacity-70')).toBeNull()
    expect(link.className).toContain('hover:bg-muted')
    expect(link.className).not.toContain('dark:hover:bg-muted')
  })

  it('renders the icon directly inside the link', () => {
    render(<SidebarItem item={ITEM} active={false} />)
    const link = screen.getByRole('link', { name: 'Quiz' })
    expect(link.querySelector('svg')?.parentElement).toBe(link)
  })

  it('renders a 36px caption row with an 18px icon', () => {
    render(<SidebarItem item={ITEM} active={false} />)
    const link = screen.getByRole('link', { name: 'Quiz' })
    expect(link.className).toContain('h-9')
    expect(link.className).toContain('text-caption')
    expect(link.className).not.toContain('text-[13px]')
    expect(link.querySelector('svg')?.getAttribute('class')).toContain('size-[18px]')
  })
})

describe('ROW_CLASS', () => {
  it('is a 36px grey caption row', () => {
    expect(ROW_CLASS).toContain('h-9')
    expect(ROW_CLASS).toContain('text-muted-foreground')
    expect(ROW_CLASS).toContain('text-caption')
    expect(ROW_CLASS).toContain('dark:hover:bg-muted')
  })
})

describe('RowIcon', () => {
  it('renders one path per entry as a decorative icon', () => {
    const { container } = render(<RowIcon paths={['M0 0', 'M1 1']} />)
    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an 18px icon without opacity', () => {
    const { container } = render(<RowIcon paths={['M0 0']} />)
    expect(container.querySelector('svg')?.parentElement).toBe(container)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('size-[18px]')
    expect(container.querySelector('.opacity-70')).toBeNull()
  })
})
