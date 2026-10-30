import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterToggle } from './question-filter-toggles'

describe('FilterHint floating surface', () => {
  it('floats light with a ring and shadow and no border', async () => {
    render(
      <FilterToggle
        label="Calculations"
        hint="Needs a calculator"
        checked={false}
        onToggle={vi.fn()}
      />,
    )
    await userEvent.hover(screen.getByRole('button', { name: /Info about Calculations/ }))
    const el = await screen.findByText('Needs a calculator')
    expect(el).toHaveClass('ring-1', 'shadow-raised', 'bg-popover')
    expect(el.className).not.toMatch(/(^|\s)border(\s|$)/)
  })
})
