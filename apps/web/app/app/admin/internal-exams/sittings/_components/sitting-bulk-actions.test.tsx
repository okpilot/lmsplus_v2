import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams('tab=sittings'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { MAX_TICKS } from '../types'
import { SittingBulkActions } from './sitting-bulk-actions'

type Over = Partial<Parameters<typeof SittingBulkActions>[0]>

function Seed({ ids, all }: Readonly<{ ids: string[]; all: boolean }>) {
  const { setRosterPage, setSelectAll } = useSittingUi()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    if (all) setSelectAll(true)
    else setRosterPage(ids, true)
  }, [ids, all, setRosterPage, setSelectAll])
  return null
}

function ui(selection: { ids: string[]; all: boolean }, over: Over = {}) {
  const props = {
    onRemove: vi.fn(),
    pageIds: ['u1', 'u2'],
    needsCodeIds: new Set<string>(),
    filtered: false,
    candidates: 120,
    shown: 2,
    ...over,
  }
  render(
    <SittingUiProvider>
      <Seed {...selection} />
      <SittingBulkActions {...props} />
    </SittingUiProvider>,
  )
  return props
}

beforeEach(() => vi.resetAllMocks())

describe('SittingBulkActions Select all link (AC 29)', () => {
  it('shows Select all {candidates} once the whole page is ticked', () => {
    ui({ ids: ['u1', 'u2'], all: false })
    expect(screen.getByRole('button', { name: 'Select all 120' })).toBeInTheDocument()
  })

  it.each([
    ['part of the page ticked', { ids: ['u1'], all: false }, {}],
    ['a filter is active', { ids: ['u1', 'u2'], all: false }, { filtered: true }],
    ['the page already shows everyone', { ids: ['u1', 'u2'], all: false }, { candidates: 2 }],
    ['all-mode is on', { ids: [], all: true }, {}],
  ])('hides it when %s', (_n, sel, over) => {
    ui(sel, over)
    expect(screen.queryByRole('button', { name: /^Select all/ })).toBeNull()
  })

  it('says All {candidates} selected in all-mode', () => {
    ui({ ids: [], all: true })
    expect(screen.getByText('All 120 selected')).toBeInTheDocument()
  })
})

describe('SittingBulkActions Add exams and Issue codes (AC 44, 46)', () => {
  it('opens Add exams with the ticked ids', async () => {
    ui({ ids: ['u1', 'u2'], all: false })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add exams' }))
    const href = String(m.push.mock.calls[0]?.[0])
    expect(href).toContain('dlg=exams')
    expect(href).toContain('ids=u1%2Cu2')
    expect(href).toContain('tab=sittings')
    expect(m.push.mock.calls[0]?.[1]).toEqual({ scroll: false })
  })

  it('opens Add exams and Issue with all=1 and no ids in all-mode', async () => {
    ui({ ids: [], all: true })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add exams' }))
    await user.click(screen.getByRole('button', { name: 'Issue codes' }))
    for (const [href] of m.push.mock.calls) {
      expect(String(href)).toContain('all=1')
      expect(String(href)).not.toContain('ids=')
    }
    expect(String(m.push.mock.calls[1]?.[0])).toContain('dlg=issue')
  })

  it('disables Issue codes when every tick is on this page and none needs a code', () => {
    ui({ ids: ['u1'], all: false })
    expect(screen.getByRole('button', { name: 'Issue codes' })).toBeDisabled()
  })

  it('enables Issue codes when a ticked person needs a code', () => {
    ui({ ids: ['u1'], all: false }, { needsCodeIds: new Set(['u1']) })
    expect(screen.getByRole('button', { name: 'Issue codes' })).toBeEnabled()
  })

  it('enables Issue codes when a tick is on another page', () => {
    ui({ ids: ['u9'], all: false })
    expect(screen.getByRole('button', { name: 'Issue codes' })).toBeEnabled()
  })

  it('enables Issue codes in all-mode even when this page needs none', () => {
    ui({ ids: [], all: true })
    expect(screen.getByRole('button', { name: 'Issue codes' })).toBeEnabled()
  })
})

describe('SittingBulkActions Remove (AC 15b)', () => {
  const many = Array.from({ length: 101 }, (_, i) => `u${i}`)

  it('is disabled in all-mode with the clear hint', () => {
    ui({ ids: [], all: true })
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(screen.getByText('Clear select-all to remove people.')).toBeInTheDocument()
  })

  it('is disabled above 100 ticks with the unfiltered hint', () => {
    ui({ ids: many, all: false })
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(screen.getByText('Tick at most 100, or select all.')).toBeInTheDocument()
  })

  it('uses the short hint when filtered', () => {
    ui({ ids: many, all: false }, { filtered: true })
    expect(screen.getByText('Tick at most 100.')).toBeInTheDocument()
  })

  it('sends only the first 101 ids to a popup so the server can flag the cap', async () => {
    ui({ ids: many, all: false })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add exams' }))
    const ids = new URL(String(m.push.mock.calls[0]?.[0]), 'http://x').searchParams.get('ids')
    expect(ids?.split(',')).toHaveLength(101)
  })

  it('removes the ticked people', async () => {
    const p = ui({ ids: ['u1'], all: false })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }))
    expect(p.onRemove).toHaveBeenCalledWith(['u1'])
  })
})

describe('SittingBulkActions tick ceiling', () => {
  const manyIds = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`)

  it('allows Remove at exactly MAX_TICKS', () => {
    ui({ ids: manyIds(MAX_TICKS), all: false })
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect(screen.queryByText(/Tick at most/)).toBeNull()
  })

  it('disables Remove and warns above MAX_TICKS', () => {
    const props = ui({ ids: manyIds(MAX_TICKS + 1), all: false })
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText(`Tick at most ${MAX_TICKS}, or select all.`)).toBeInTheDocument()
    expect(props.onRemove).not.toHaveBeenCalled()
  })
})
