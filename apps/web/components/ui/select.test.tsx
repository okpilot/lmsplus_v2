import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Select, SelectTrigger, SelectValue } from './select'

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
