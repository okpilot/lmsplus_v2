import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Section } from './section'

describe('Section', () => {
  it('renders the title, the count and its children', () => {
    render(
      <Section title="People" count={12}>
        <p>body</p>
      </Section>,
    )
    expect(screen.getByRole('heading', { name: /People/ })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('renders its actions', () => {
    render(
      <Section title="People" actions={<button type="button">Add people</button>}>
        <p>body</p>
      </Section>,
    )
    expect(screen.getByRole('button', { name: 'Add people' })).toBeInTheDocument()
  })

  it('renders no count when none is given', () => {
    render(
      <Section title="People">
        <p>body</p>
      </Section>,
    )
    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })
})
