import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DialogLine as DialogLineModel } from '../_utils/parse-dialog-display'
import { DialogLine } from './dialog-line'

const LINE: DialogLineModel = {
  speaker: 'atc',
  segments: [
    { type: 'text', value: 'Cleared to ' },
    { type: 'blank', index: 0 },
    { type: 'text', value: ' runway' },
  ],
}

describe('DialogLine', () => {
  it('renders the speaker label, text segments, and an input per blank', () => {
    render(
      <DialogLine
        line={LINE}
        values={{}}
        onChange={vi.fn()}
        disabled={false}
        results={{}}
        locked={false}
      />,
    )
    expect(screen.getByText('ATC:')).toBeInTheDocument()
    expect(screen.getByText(/Cleared to/)).toBeInTheDocument()
    expect(screen.getByTestId('blank-0')).toBeInTheDocument()
  })

  it('reveals the per-blank canonical only for an incorrect blank', () => {
    render(
      <DialogLine
        line={LINE}
        values={{ 0: 'wrong' }}
        onChange={vi.fn()}
        disabled={false}
        results={{ 0: { isCorrect: false, canonical: 'land' } }}
        locked
      />,
    )
    expect(screen.getByTestId('blank-canonical-0')).toHaveTextContent('land')
  })

  it('does not reveal the canonical for a correct blank', () => {
    render(
      <DialogLine
        line={LINE}
        values={{ 0: 'land' }}
        onChange={vi.fn()}
        disabled={false}
        results={{ 0: { isCorrect: true, canonical: 'land' } }}
        locked
      />,
    )
    expect(screen.queryByTestId('blank-canonical-0')).not.toBeInTheDocument()
  })

  it('renders no speaker label when the line has no speaker', () => {
    render(
      <DialogLine
        line={{ speaker: null, segments: [{ type: 'text', value: 'Wind 270' }] }}
        values={{}}
        onChange={vi.fn()}
        disabled={false}
        results={{}}
        locked={false}
      />,
    )
    expect(screen.queryByText('ATC:')).not.toBeInTheDocument()
    expect(screen.queryByText('Pilot:')).not.toBeInTheDocument()
  })
})
