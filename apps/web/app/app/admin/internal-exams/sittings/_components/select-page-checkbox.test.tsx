import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SelectPageCheckbox } from './select-page-checkbox'

const box = (p: { total: number; ticked: number; disabled?: boolean }, onChange = vi.fn()) => {
  render(<SelectPageCheckbox {...p} onChange={onChange} />)
  return { onChange, cb: screen.getByRole('checkbox') }
}

describe('SelectPageCheckbox', () => {
  it('is checked when every tickable row is ticked', () => {
    expect(box({ total: 3, ticked: 3 }).cb).toBeChecked()
  })

  it('is indeterminate, not checked, when only some are ticked', () => {
    const { cb } = box({ total: 3, ticked: 1 })
    expect(cb).not.toBeChecked()
    expect(cb).toHaveAttribute('aria-checked', 'mixed')
  })

  it('is disabled with nothing to tick', () => {
    expect(box({ total: 0, ticked: 0 }).cb).toHaveAttribute('aria-disabled', 'true')
  })

  it('reports the new state on click and names the page count', async () => {
    const { onChange } = box({ total: 2, ticked: 0 })
    expect(screen.getByRole('checkbox', { name: 'Select all 2 shown' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
