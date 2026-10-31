import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FractionLine } from './fraction-line'

describe('FractionLine', () => {
  it('renders the success class and no icon when all correct', () => {
    const { container } = render(<FractionLine correct={3} total={3} noun="zone" />)
    expect(screen.getByText('3 / 3 zones correct').className).toContain('text-success')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders the danger class and no icon when none correct', () => {
    const { container } = render(<FractionLine correct={0} total={3} noun="zone" />)
    expect(screen.getByText('0 / 3 zones correct').className).toContain('text-danger')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders the muted class and a caution icon when partial', () => {
    const { container } = render(<FractionLine correct={1} total={3} noun="zone" />)
    expect(screen.getByText('1 / 3 zones correct').className).toContain('text-muted-foreground')
    const icon = container.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('class')).toContain('text-caution')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('uses the singular noun for a total of 1', () => {
    render(<FractionLine correct={1} total={1} noun="blank" />)
    expect(screen.getByText('1 / 1 blank correct')).toBeInTheDocument()
  })

  it('uses the plural noun otherwise', () => {
    render(<FractionLine correct={0} total={2} noun="blank" />)
    expect(screen.getByText('0 / 2 blanks correct')).toBeInTheDocument()
  })
})
