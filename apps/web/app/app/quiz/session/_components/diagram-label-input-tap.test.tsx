import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./diagrams/registry', () => ({
  getDiagramComponent: vi.fn(() => () => <svg data-testid="diagram-art" />),
}))

import { DiagramLabelInput } from './diagram-label-input'
import { serializeMapping } from './diagram-label-input-helpers'

const ZONES = [
  { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
  { id: 'z2', x: 0.3, y: 0.3, w: 0.1, h: 0.1 },
]
const LABELS = [
  { id: 'l1', text: 'Upwind' },
  { id: 'l2', text: 'Downwind' },
]

function stubViewport(phone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      matches: query.includes('max-width') ? phone : !phone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

function renderInput(extra: Partial<React.ComponentProps<typeof DiagramLabelInput>> = {}) {
  const onSubmit = vi.fn()
  render(
    <DiagramLabelInput
      imageRef="x"
      zones={ZONES}
      labels={LABELS}
      onSubmit={onSubmit}
      disabled={false}
      {...extra}
    />,
  )
  return { onSubmit }
}

afterEach(() => vi.unstubAllGlobals())

describe('DiagramLabelInput on phones (B2b-12 AC 5)', () => {
  it('renders an answer row per zone and a tap chip per label below 640px', () => {
    stubViewport(true)
    renderInput()
    expect(screen.getByTestId('diagram-row-z1')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-row-z2')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-tap-chip-l1')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-tap-chip-l2')).toBeInTheDocument()
  })

  it('numbers the answer rows in an ordered list', () => {
    stubViewport(true)
    renderInput()
    const row = screen.getByTestId('diagram-row-z1')
    expect(row.closest('ol')).not.toBeNull()
    expect(within(row).getByText('1')).toBeInTheDocument()
  })

  it('shows the tap hint on an empty row', () => {
    stubViewport(true)
    renderInput()
    expect(
      within(screen.getByTestId('diagram-row-z1')).getByText(/tap, then pick a label/i),
    ).toBeInTheDocument()
  })

  it('tap a pool label then a row places the label', async () => {
    stubViewport(true)
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z2'))
    expect(within(screen.getByTestId('diagram-row-z2')).getByText('Upwind')).toBeInTheDocument()
  })

  it('tap a row then a pool label places the label', async () => {
    stubViewport(true)
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l2'))
    expect(within(screen.getByTestId('diagram-row-z1')).getByText('Downwind')).toBeInTheDocument()
  })

  it('submits the placement through serializeMapping', async () => {
    stubViewport(true)
    const { onSubmit } = renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByRole('button', { name: /submit|check/i }))
    expect(onSubmit).toHaveBeenCalledWith(serializeMapping(new Map([['z1', 'l1']])))
  })

  it('pool is one non-wrapping scrolling line pinned above the bottom nav', async () => {
    stubViewport(true)
    renderInput()
    const pool = screen.getByTestId('diagram-tap-chip-l1').parentElement
    expect(pool?.className).toContain('sticky')
    expect(pool?.className).toContain('flex-nowrap')
    expect(pool?.className).toContain('overflow-x-auto')
    expect(screen.getByTestId('diagram-tap-chip-l1').className).toContain('shrink-0')
  })

  it('graded wrong rows show the canonical label after an arrow', () => {
    stubViewport(true)
    renderInput({
      submitted: true,
      submittedMapping: [{ zoneId: 'z1', labelId: 'l2' }],
      correctMapping: [
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l2' },
      ],
    })
    expect(screen.getByTestId('diagram-row-z1').textContent).toMatch(/→\s*Upwind/)
    expect(
      within(screen.getByTestId('diagram-row-z2')).getByText(/not answered/i),
    ).toBeInTheDocument()
  })

  it('keeps the drag UI at 640px and wider', () => {
    stubViewport(false)
    renderInput()
    expect(screen.getByTestId('diagram-label-zone-z1')).toBeInTheDocument()
    expect(screen.queryByTestId('diagram-row-z1')).toBeNull()
  })
})
