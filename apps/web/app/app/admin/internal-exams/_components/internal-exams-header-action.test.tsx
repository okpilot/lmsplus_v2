import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockSearch = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams(mockSearch.value),
}))
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    replace,
  }: {
    href: string
    children: React.ReactNode
    replace?: boolean
  }) => (
    <a href={href} data-replace={replace ? 'true' : undefined}>
      {children}
    </a>
  ),
}))

import { InternalExamsHeaderAction } from './internal-exams-header-action'

describe('InternalExamsHeaderAction', () => {
  it('links to the new-sitting dialog on the sittings tab, keeping other params', () => {
    mockSearch.value = 'tab=sittings&scope=open'
    render(<InternalExamsHeaderAction />)
    const href = screen.getByRole('link', { name: /New sitting/ }).getAttribute('href') as string
    expect(href).toContain('tab=sittings')
    expect(href).toContain('dlg=new')
    expect(href).toContain('scope=open')
    expect(screen.getByRole('link', { name: /New sitting/ })).toHaveAttribute(
      'data-replace',
      'true',
    )
  })

  it.each(['tab=codes', 'tab=attempts', '', 'tab=bogus'])('renders nothing for "%s"', (qs) => {
    mockSearch.value = qs
    const { container } = render(<InternalExamsHeaderAction />)
    expect(container).toBeEmptyDOMElement()
  })
})
