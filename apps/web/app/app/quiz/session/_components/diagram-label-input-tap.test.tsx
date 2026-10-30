import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

describe('DiagramLabelInput on every screen (tap-list amendment AC 1)', () => {
  it('renders an answer row per zone and a tap chip per label ', () => {
    renderInput()
    expect(screen.getByTestId('diagram-row-z1')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-row-z2')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-tap-chip-l1')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-tap-chip-l2')).toBeInTheDocument()
  })

  it('numbers the answer rows in an ordered list', () => {
    renderInput()
    const row = screen.getByTestId('diagram-row-z1')
    expect(row.closest('ol')).not.toBeNull()
    expect(within(row).getByText('1')).toBeInTheDocument()
  })

  it('shows the tap hint on an empty row', () => {
    renderInput()
    expect(
      within(screen.getByTestId('diagram-row-z1')).getByText(/tap, then pick a label/i),
    ).toBeInTheDocument()
  })

  it('tap a pool label then a row places the label', async () => {
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z2'))
    expect(within(screen.getByTestId('diagram-row-z2')).getByText('Upwind')).toBeInTheDocument()
  })

  it('tap a row then a pool label places the label', async () => {
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l2'))
    expect(within(screen.getByTestId('diagram-row-z1')).getByText('Downwind')).toBeInTheDocument()
  })

  it('submits the placement through serializeMapping', async () => {
    const { onSubmit } = renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByRole('button', { name: /submit|check/i }))
    expect(onSubmit).toHaveBeenCalledWith(serializeMapping(new Map([['z1', 'l1']])))
  })

  it('pool is one non-wrapping scrolling line pinned above the bottom nav', async () => {
    renderInput()
    const pool = screen.getByTestId('diagram-tap-chip-l1').parentElement
    expect(pool?.className).toContain('sticky')
    expect(pool?.className).toContain('flex-nowrap')
    expect(pool?.className).toContain('overflow-x-auto')
    expect(screen.getByTestId('diagram-tap-chip-l1').className).toContain('shrink-0')
  })

  it('graded wrong rows show the canonical label after an arrow', () => {
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

  it('pool is pinned above the bottom nav below sm and near the viewport bottom from sm (AC 2)', () => {
    renderInput()
    const cls = screen.getByTestId('diagram-tap-chip-l1').parentElement?.className ?? ''
    expect(cls).toMatch(/(^|\s)bottom-/)
    expect(cls).not.toContain('sm:bottom-4')
    expect(cls).not.toMatch(/(^|\s)(sm|lg):static/)
  })

  it('graded rows render at full opacity (AC 3)', () => {
    renderInput({
      submitted: true,
      submittedMapping: [{ zoneId: 'z1', labelId: 'l2' }],
      correctMapping: [
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l2' },
      ],
    })
    expect(screen.getByTestId('diagram-row-z1').className).toContain('disabled:opacity-100')
    expect(screen.getByTestId('diagram-row-z2').className).toContain('disabled:opacity-100')
  })

  it('renders no drag machinery for diagram questions (AC 1)', () => {
    const { container } = render(
      <DiagramLabelInput
        imageRef="x"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    expect(screen.queryByTestId('diagram-label-zone-z1')).toBeNull()
    expect(screen.queryByTestId('diagram-label-pool')).toBeNull()
    expect(screen.queryByTestId('diagram-label-chip-l1')).toBeNull()
    expect(container.querySelector('[id^="DndDescribedBy"]')).toBeNull()
  })

  it('rows and pool chips are buttons reachable by Tab (AC 5)', async () => {
    renderInput()
    expect(screen.getByTestId('diagram-row-z1').tagName).toBe('BUTTON')
    expect(screen.getByTestId('diagram-tap-chip-l1').tagName).toBe('BUTTON')
    await userEvent.tab()
    expect(screen.getByTestId('diagram-row-z1')).toHaveFocus()
  })

  it('Enter on a focused chip then Enter on a focused row places the label (AC 5)', async () => {
    renderInput()
    screen.getByTestId('diagram-tap-chip-l1').focus()
    await userEvent.keyboard('{Enter}')
    screen.getByTestId('diagram-row-z2').focus()
    await userEvent.keyboard(' ')
    expect(within(screen.getByTestId('diagram-row-z2')).getByText('Upwind')).toBeInTheDocument()
  })

  it('row accessible name states the zone number and placed label, no aria-label override (AC 5)', async () => {
    renderInput()
    const row = screen.getByTestId('diagram-row-z1')
    expect(row).not.toHaveAttribute('aria-label')
    expect(row).toHaveAccessibleName(/1/)
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(row)
    expect(screen.getByTestId('diagram-row-z1')).toHaveAccessibleName(/1[\s\S]*Upwind/)
  })

  it('armed pool chip and armed row expose aria-pressed (AC 5)', async () => {
    renderInput()
    const chip = screen.getByTestId('diagram-tap-chip-l1')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(screen.getByTestId('diagram-tap-chip-l1')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    expect(screen.getByTestId('diagram-row-z1')).toHaveAttribute('aria-pressed', 'true')
  })

  it('a placed label armed shows a "Return to pool" button that unplaces it (AC 5)', async () => {
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByRole('button', { name: /return to pool/i }))
    expect(within(screen.getByTestId('diagram-row-z1')).queryByText('Upwind')).toBeNull()
    expect(screen.getByTestId('diagram-tap-chip-l1')).toBeInTheDocument()
  })

  it('focus moves to the row a pool chip was placed in (AC 5)', async () => {
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z2'))
    expect(screen.getByTestId('diagram-row-z2')).toHaveFocus()
  })

  it('Return to pool moves focus to the returned chip', async () => {
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByRole('button', { name: /return to pool/i }))
    expect(screen.getByTestId('diagram-tap-chip-l1')).toHaveFocus()
  })

  it.each([{ submitting: true }, { submitted: true }])(
    'an armed label is dropped once locked (%o): no "Tap to place here"',
    (extra) => {
      const props = {
        imageRef: 'x',
        zones: ZONES,
        labels: LABELS,
        onSubmit: vi.fn(),
        disabled: false,
      }
      const { rerender } = render(<DiagramLabelInput {...props} />)
      return userEvent.click(screen.getByTestId('diagram-tap-chip-l1')).then(() => {
        expect(screen.getByTestId('diagram-row-z1').textContent).toMatch(/tap to place here/i)
        rerender(<DiagramLabelInput {...props} {...extra} />)
        expect(screen.getByTestId('diagram-row-z1').textContent).not.toMatch(/tap to place here/i)
        expect(screen.getByTestId('diagram-row-z2').textContent).not.toMatch(/tap to place here/i)
      })
    },
  )

  describe('graded rows', () => {
    const graded = {
      submitted: true,
      submittedMapping: [{ zoneId: 'z1', labelId: 'l2' }],
      correctMapping: [
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l2' },
      ],
    }

    it('an incorrect row name contains "incorrect"', () => {
      renderInput(graded)
      expect(screen.getByTestId('diagram-row-z1')).toHaveAccessibleName(/incorrect/i)
    })

    it('a correct row name contains "correct" but not "incorrect"', () => {
      renderInput({
        ...graded,
        submittedMapping: [{ zoneId: 'z1', labelId: 'l1' }],
      })
      const name = screen.getByTestId('diagram-row-z1')
      expect(name).toHaveAccessibleName(/correct/i)
      expect(name).not.toHaveAccessibleName(/incorrect/i)
    })

    it('badge uses the foreground token pair, not text-white', () => {
      renderInput(graded)
      const badge = within(screen.getByTestId('diagram-row-z1')).getByText('1')
      expect(badge.className).toContain('text-danger-foreground')
      expect(badge.className).toContain('bg-danger-solid')
      expect(badge.className).not.toContain('text-white')
    })
  })
})
