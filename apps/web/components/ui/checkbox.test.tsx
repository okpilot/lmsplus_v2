import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Checkbox } from './checkbox'

describe('Checkbox', () => {
  it('marks an indeterminate box as mixed, not checked', () => {
    render(<Checkbox aria-label="Select all" indeterminate checked={false} />)
    const box = screen.getByRole('checkbox', { name: 'Select all' })
    expect(box).toHaveAttribute('aria-checked', 'mixed')
    expect(box).toHaveAttribute('data-indeterminate')
    expect(box).not.toHaveAttribute('data-checked')
  })

  it('fills an indeterminate box, so it does not read as unselected', () => {
    render(<Checkbox aria-label="Select all" indeterminate checked={false} />)
    const classes = screen.getByRole('checkbox', { name: 'Select all' }).className.split(/\s+/)
    expect(classes).toContain('data-indeterminate:bg-primary')
    expect(classes).toContain('data-indeterminate:border-primary')
  })

  it('swaps the tick for a dash while indeterminate', () => {
    const { container } = render(<Checkbox aria-label="Select all" indeterminate checked={false} />)
    const icons = Array.from(container.querySelectorAll('svg'))
    const hiddenWhileIndeterminate = icons.filter((i) =>
      i.getAttribute('class')?.includes('group-data-indeterminate/checkbox:hidden'),
    )
    const shownWhileIndeterminate = icons.filter((i) =>
      i.getAttribute('class')?.includes('group-data-indeterminate/checkbox:block'),
    )
    expect(hiddenWhileIndeterminate).toHaveLength(1)
    expect(shownWhileIndeterminate).toHaveLength(1)
    expect(shownWhileIndeterminate[0]?.getAttribute('class')).toContain('hidden')
  })

  it('names the group the icon variants hang off', () => {
    render(<Checkbox aria-label="Select all" />)
    expect(screen.getByRole('checkbox', { name: 'Select all' }).className.split(/\s+/)).toContain(
      'group/checkbox',
    )
  })

  it('still renders a plain checked box as checked', () => {
    render(<Checkbox aria-label="One" checked />)
    const box = screen.getByRole('checkbox', { name: 'One' })
    expect(box).toHaveAttribute('aria-checked', 'true')
    expect(box).toHaveAttribute('data-checked')
    expect(box).not.toHaveAttribute('data-indeterminate')
  })
})
