import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardList, CardListRow } from './card'

describe('CardList', () => {
  it('renders data-slot card-list with divider classes and Card base, no shadow', () => {
    const { container } = render(
      <CardList className="extra">
        <div>a</div>
        <div>b</div>
      </CardList>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('data-slot')).toBe('card-list')
    for (const c of [
      'gap-0',
      'py-0',
      'divide-y',
      'divide-border',
      'rounded-card',
      'ring-1',
      'ring-border',
      'extra',
    ]) {
      expect(el.className).toContain(c)
    }
    expect(el.className).not.toMatch(/(^|\s)shadow/)
    expect(Card).toBeTypeOf('function')
  })
})

describe('CardListRow', () => {
  it('pads a row with the card sides and the row height', () => {
    const { container } = render(<CardListRow className="extra">a</CardListRow>)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('data-slot')).toBe('card-list-row')
    expect(el.className).toContain('px-card')
    expect(el.className).toContain('py-row')
    expect(el.className).toContain('extra')
  })

  it('renders as the element given in render, keeping the row padding', () => {
    const { getByRole } = render(<CardListRow render={<a href="/x" />}>go</CardListRow>)
    const link = getByRole('link', { name: 'go' })
    expect(link.className).toContain('py-row')
  })
})
