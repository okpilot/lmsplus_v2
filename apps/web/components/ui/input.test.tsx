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
    expect(screen.getByRole('textbox').className).toMatch(/(^|\s)bg-field-fill(\s|$)/)
  })
})

describe('Input sizes (B2b-12 AC 3)', () => {
  it('lg is 48px with px-4 py-3 and rounded-control', () => {
    render(<Input aria-label="Big" size="lg" />)
    const c = screen.getByRole('textbox').className
    expect(c).toContain('h-12')
    expect(c).toContain('px-4')
    expect(c).toContain('py-3')
    expect(c).toContain('rounded-control')
  })

  it('sm is 28px with px-2 py-0, text-body and rounded-inner', () => {
    render(<Input aria-label="Small" size="sm" />)
    const c = screen.getByRole('textbox').className
    expect(c).toContain('h-7')
    expect(c).toContain('px-2')
    expect(c).toContain('py-0')
    expect(c.split(' ')).toContain('text-body')
    expect(c.split(' ')).not.toContain('text-label')
    expect(c).toContain('rounded-inner')
  })

  it('does not forward size to the HTML attribute', () => {
    render(<Input aria-label="Small" size="sm" />)
    expect(screen.getByRole('textbox')).not.toHaveAttribute('size')
  })

  it('a className passed in wins over the size classes', () => {
    render(<Input aria-label="X" size="sm" className="w-auto" />)
    expect(screen.getByRole('textbox').className).toContain('w-auto')
  })
})

describe('Input file button (B2b-12 AC 2)', () => {
  it('styles the file selector as a small outlined button', () => {
    render(<Input aria-label="Upload" type="file" />)
    const c = screen.getByLabelText('Upload').className
    expect(c).toContain('file:h-6')
    expect(c).toContain('file:border-input')
    expect(c).toContain('file:bg-card')
    expect(c).toContain('file:px-2')
    expect(c).toContain('file:mr-2')
    expect(c).toContain('file:rounded-inner')
  })
})
