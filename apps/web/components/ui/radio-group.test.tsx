import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Radio, RadioGroup } from './radio-group'

function Group({ onValueChange = vi.fn(), disabled = false, value = null as string | null }) {
  return (
    <RadioGroup value={value} onValueChange={onValueChange} disabled={disabled}>
      <Radio value="a" aria-label="Alpha" />
      <Radio value="b" aria-label="Bravo" />
    </RadioGroup>
  )
}

describe('RadioGroup', () => {
  it('renders a radiogroup of radios', () => {
    render(<Group />)
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('reports the clicked value', async () => {
    const onValueChange = vi.fn()
    render(<Group onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Bravo' }))
    expect(onValueChange.mock.calls[0]?.[0]).toBe('b')
  })

  it('marks only the selected radio checked', () => {
    render(<Group value="a" />)
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Bravo' })).not.toBeChecked()
  })

  it('draws a 16px circle with card fill and input border', () => {
    render(<Group />)
    const c = screen.getByRole('radio', { name: 'Alpha' }).className
    expect(c).toContain('size-4')
    expect(c).toContain('rounded-pill')
    expect(c).toContain('border-input')
    expect(c).toContain('bg-card')
  })

  it('checked is primary border and fill', () => {
    render(<Group value="a" />)
    const c = screen.getByRole('radio', { name: 'Alpha' }).className
    expect(c).toContain('data-checked:border-primary')
    expect(c).toContain('data-checked:bg-primary')
  })

  it('draws the 8px primary-foreground dot as an indicator', () => {
    render(<Group value="a" />)
    const dot = screen.getByRole('radio', { name: 'Alpha' }).querySelector('span')
    expect(dot?.className).toContain('size-2')
    expect(dot?.className).toContain('bg-primary-foreground')
  })

  it('disabled on the group blocks selection', async () => {
    const onValueChange = vi.fn()
    render(<Group disabled onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Bravo' }))
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
