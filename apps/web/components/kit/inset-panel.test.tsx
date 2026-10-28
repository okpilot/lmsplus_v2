import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InsetPanel } from './inset-panel'

describe('InsetPanel', () => {
  it('renders a muted rounded-control panel without border', () => {
    const { container } = render(<InsetPanel>x</InsetPanel>)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('data-slot')).toBe('inset-panel')
    expect(el.className).toContain('rounded-control')
    expect(el.className).toContain('bg-muted')
    expect(el.className).toContain('p-3')
    expect(el.className.split(/\s+/)).not.toContain('border')
  })

  it('className p-2 replaces p-3', () => {
    const { container } = render(<InsetPanel className="p-2">x</InsetPanel>)
    const el = container.firstElementChild as HTMLElement
    expect(el.className.split(/\s+/)).toContain('p-2')
    expect(el.className.split(/\s+/)).not.toContain('p-3')
  })
})
