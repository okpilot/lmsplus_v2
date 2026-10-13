import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Input } from './input'

describe('Input', () => {
  it('sizes the field with the control height', () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByRole('textbox').className).toContain('h-(--control-h)')
  })

  it('fills the field white', () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByRole('textbox').className).toContain('bg-card')
  })
})
