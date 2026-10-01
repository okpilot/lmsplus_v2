import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChoicePills } from './choice-pills'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const

describe('ChoicePills', () => {
  it('marks only the picked option as pressed', () => {
    render(<ChoicePills label="Greek" options={OPTIONS} value="b" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the value of the clicked option', async () => {
    const onChange = vi.fn()
    render(<ChoicePills label="Greek" options={OPTIONS} value="a" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Gamma' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('marks several options as pressed when given an array value', () => {
    render(<ChoicePills label="Greek" options={OPTIONS} value={['a', 'c']} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('exposes the group under its label', () => {
    render(<ChoicePills label="Greek" options={OPTIONS} value="a" onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Greek' })).toBeInTheDocument()
  })
})
