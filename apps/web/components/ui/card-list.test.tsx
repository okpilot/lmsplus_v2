import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardList } from './card'

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
