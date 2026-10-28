import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

describe('SelectTrigger', () => {
  it('widens the small trigger tap area without reaching a neighbour', () => {
    render(
      <Select>
        <SelectTrigger size="sm" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    )
    expect(screen.getByRole('combobox').className).toContain('data-[size=sm]:after:-inset-x-0.5')
  })
})

describe('SelectContent', () => {
  it('opens below its field on the raised overlay surface', () => {
    render(
      <Select defaultOpen>
        <SelectTrigger aria-label="Difficulty">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="easy">Easy</SelectItem>
        </SelectContent>
      </Select>,
    )
    const popup = document.querySelector('[data-slot="select-content"]')
    expect(popup).not.toBeNull()
    expect(popup?.getAttribute('data-align-trigger')).toBe('false')
    expect(popup?.className).toContain('bg-overlay')
    expect(popup?.className).toContain('ring-border')
  })
})
