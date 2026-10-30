import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./diagrams/registry', () => ({
  getDiagramComponent: vi.fn((imageRef: string) =>
    imageRef === 'known-diagram' ? () => <svg data-testid="diagram-art" /> : null,
  ),
}))

import { DiagramLabelInput } from './diagram-label-input'

const ZONES = [
  { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
  { id: 'z2', x: 0.3, y: 0.3, w: 0.1, h: 0.1 },
]
const LABELS = [
  { id: 'l1', text: 'Upwind' },
  { id: 'l2', text: 'Downwind' },
  { id: 'l3', text: 'Distractor' },
]
const CORRECT = [
  { zoneId: 'z1', labelId: 'l1' },
  { zoneId: 'z2', labelId: 'l2' },
]

function renderInput(extra: Partial<React.ComponentProps<typeof DiagramLabelInput>> = {}) {
  const onSubmit = vi.fn()
  render(
    <DiagramLabelInput
      imageRef="known-diagram"
      zones={ZONES}
      labels={LABELS}
      onSubmit={onSubmit}
      disabled={false}
      {...extra}
    />,
  )
  return { onSubmit }
}

describe('DiagramLabelInput (numbered tap list)', () => {
  it('lays the answer rows out in two columns from the sm breakpoint, one on phones', () => {
    renderInput()
    const list = screen.getByTestId('diagram-row-z1').closest('ol')
    expect(list?.className).toContain('grid')
    expect(list?.className).toContain('sm:grid-cols-2')
    expect(list?.className).not.toMatch(/(^| )grid-cols-2/)
  })

  it('renders the artwork, an answer row per zone and a chip per label', () => {
    renderInput()
    expect(screen.getByTestId('diagram-art')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-row-z1')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-row-z2')).toBeInTheDocument()
    for (const id of ['l1', 'l2', 'l3'])
      expect(screen.getByTestId(`diagram-tap-chip-${id}`)).toBeInTheDocument()
  })

  it('shows a fallback alert and no rows or Submit when the image_ref is unknown', () => {
    renderInput({ imageRef: 'nope' })
    expect(screen.getByRole('alert')).toHaveTextContent(/refresh/i)
    expect(screen.queryByTestId('diagram-row-z1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
  })

  it('removes a placed label from the pool', async () => {
    renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    expect(screen.queryByTestId('diagram-tap-chip-l1')).not.toBeInTheDocument()
  })

  it('submits the current placement as zoneId/labelId pairs', async () => {
    const { onSubmit } = renderInput()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    await userEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    expect(onSubmit).toHaveBeenCalledWith([{ zoneId: 'z1', labelId: 'l1' }])
  })

  it('disables Submit until a label is placed', async () => {
    const { onSubmit } = renderInput()
    const submit = screen.getByRole('button', { name: /submit answer/i })
    expect(submit).toBeDisabled()
    await userEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeEnabled()
  })

  it('shows a spinner and disables Submit while submitting', () => {
    renderInput({ submitting: true })
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.animate-spin')).not.toBeNull()
  })

  it('ignores taps while submitting', async () => {
    renderInput({ submitting: true })
    await userEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    await userEvent.click(screen.getByTestId('diagram-row-z1'))
    expect(screen.getByTestId('diagram-tap-chip-l1')).toBeInTheDocument()
  })

  it('hides Submit and the pool once submitted', () => {
    renderInput({ submitted: true })
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('diagram-tap-chip-l1')).not.toBeInTheDocument()
  })

  it('restores the submitted placement into its rows', () => {
    renderInput({ submitted: true, submittedMapping: [{ zoneId: 'z1', labelId: 'l1' }] })
    expect(within(screen.getByTestId('diagram-row-z1')).getByText('Upwind')).toBeInTheDocument()
  })

  it('disables every row once submitted', () => {
    renderInput({ submitted: true, submittedMapping: [{ zoneId: 'z1', labelId: 'l1' }] })
    expect(screen.getByTestId('diagram-row-z1')).toBeDisabled()
    expect(screen.getByTestId('diagram-row-z2')).toBeDisabled()
  })

  it('disables rows and chips when disabled', () => {
    renderInput({ disabled: true })
    expect(screen.getByTestId('diagram-row-z1')).toBeDisabled()
    expect(screen.getByTestId('diagram-tap-chip-l1')).toBeDisabled()
  })

  it('marks graded rows correct or incorrect via data-result', () => {
    renderInput({
      submitted: true,
      submittedMapping: [
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l3' },
      ],
      correctMapping: CORRECT,
    })
    expect(screen.getByTestId('diagram-row-z1')).toHaveAttribute('data-result', 'correct')
    expect(screen.getByTestId('diagram-row-z2')).toHaveAttribute('data-result', 'incorrect')
  })

  it('reveals the canonical label after an arrow on a wrong row, not on a correct one', () => {
    renderInput({
      submitted: true,
      submittedMapping: [
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l3' },
      ],
      correctMapping: CORRECT,
    })
    expect(screen.getByTestId('diagram-row-z2').textContent).toMatch(/→\s*Downwind/)
    expect(screen.getByTestId('diagram-row-z1').textContent).not.toContain('→')
  })

  it('announces Correct in a polite status region when every zone matches', () => {
    renderInput({ submitted: true, submittedMapping: CORRECT, correctMapping: CORRECT })
    const live = screen.getByTestId('diagram-label-result')
    expect(live).toHaveAttribute('role', 'status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('Correct')
  })

  it('announces Incorrect when any zone is wrong', () => {
    renderInput({
      submitted: true,
      submittedMapping: [{ zoneId: 'z1', labelId: 'l2' }],
      correctMapping: CORRECT,
    })
    expect(screen.getByTestId('diagram-label-result')).toHaveTextContent('Incorrect')
  })

  it('does not announce a result before grading data arrives', () => {
    renderInput({ submitted: true, submittedMapping: CORRECT })
    expect(screen.queryByTestId('diagram-label-result')).not.toBeInTheDocument()
  })
})

describe('DiagramLabelInput pool background while busy', () => {
  it('ignores a pool background tap while submitting, so the placement stays as submitted', () => {
    const el = (submitting: boolean) => (
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitting={submitting}
      />
    )
    const { rerender } = render(el(false))
    fireEvent.click(screen.getByTestId('diagram-tap-chip-l1'))
    fireEvent.click(screen.getByTestId('diagram-row-z1'))
    fireEvent.click(screen.getByTestId('diagram-row-z1'))
    rerender(el(true))
    fireEvent.click(screen.getByTestId('diagram-tap-pool'))
    expect(screen.getByTestId('diagram-row-z1').textContent).toContain('Upwind')
  })
})
