import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ui = vi.hoisted(() => ({ rosterIds: [] as string[], clearRoster: vi.fn() }))
vi.mock('../_hooks/sitting-ui-context', () => ({ useSittingUi: () => ui }))

import { MAX_TICKS } from '../parse-sitting-params'
import { SittingBulkActions } from './sitting-bulk-actions'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`)

describe('SittingBulkActions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    ui.rosterIds = ids(2)
  })

  it('shows the ticked count and removes exactly the ticked ids', () => {
    const onRemove = vi.fn()
    render(<SittingBulkActions onRemove={onRemove} />)
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(['u0', 'u1'])
  })

  it('clears the selection on Clear', () => {
    render(<SittingBulkActions onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(ui.clearRoster).toHaveBeenCalledTimes(1)
  })

  it('allows Remove at exactly MAX_TICKS', () => {
    ui.rosterIds = ids(MAX_TICKS)
    render(<SittingBulkActions onRemove={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect(screen.queryByText(`Tick at most ${MAX_TICKS}.`)).toBeNull()
  })

  it('disables Remove and warns above MAX_TICKS', () => {
    ui.rosterIds = ids(MAX_TICKS + 1)
    const onRemove = vi.fn()
    render(<SittingBulkActions onRemove={onRemove} />)
    const btn = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByText(`Tick at most ${MAX_TICKS}.`)).toBeTruthy()
  })
})
