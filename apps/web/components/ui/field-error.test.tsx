import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FieldError } from './field-error'

describe('FieldError', () => {
  it('renders the message in a paragraph with the danger colour', () => {
    render(<FieldError>Required</FieldError>)
    const el = screen.getByText('Required')
    expect(el.tagName).toBe('P')
    expect(el).toHaveAttribute('data-slot', 'field-error')
    expect(el.className).toContain('text-danger')
  })

  it('hides its icon from assistive tech', () => {
    render(<FieldError>Required</FieldError>)
    const svg = screen.getByText('Required').querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('passes id and role through', () => {
    render(
      <FieldError id="e1" role="alert">
        Bad
      </FieldError>,
    )
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'e1')
  })

  it('has no role when the caller omits it', () => {
    render(<FieldError>Bad</FieldError>)
    expect(screen.getByText('Bad')).not.toHaveAttribute('role')
  })

  it.each([null, undefined, ''])('renders nothing for %p children', (children) => {
    const { container } = render(<FieldError>{children}</FieldError>)
    expect(container).toBeEmptyDOMElement()
  })
})
