import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Stat } from './stat'

describe('Stat empty optional nodes', () => {
  it('renders a zero hint', () => {
    render(<Stat label="L" value="1" hint={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders nothing for a false hint', () => {
    const { container } = render(<Stat label="L" value="1" hint={false} />)
    expect(container.querySelector('.text-caption')).toBeNull()
  })

  it('renders a zero trend beside the label', () => {
    render(<Stat label="L" value="1" trend={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('keeps the label alone for a false trend', () => {
    const { container } = render(<Stat label="L" value="1" trend={false} />)
    expect(container.querySelector('.justify-between')).toBeNull()
  })
})
