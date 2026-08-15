import { fireEvent, render, screen } from '@testing-library/react'
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

  it('calls onEnter with the blank index when Enter is pressed in that blank', () => {
    const onEnter = vi.fn()
    render(
      <DialogLine
        line={LINE}
        values={{}}
        onChange={vi.fn()}
        disabled={false}
        results={{}}
        locked={false}
        onEnter={onEnter}
      />,
    )
    fireEvent.keyDown(screen.getByTestId('blank-0'), { key: 'Enter' })
    expect(onEnter).toHaveBeenCalledWith(0)
  })

  it('does not call onEnter when a different key is pressed', () => {
    const onEnter = vi.fn()
    render(
      <DialogLine
        line={LINE}
        values={{}}
        onChange={vi.fn()}
        disabled={false}
        results={{}}
        locked={false}
        onEnter={onEnter}
      />,
    )
    fireEvent.keyDown(screen.getByTestId('blank-0'), { key: 'Tab' })
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('prevents the default Enter behaviour so a surrounding form does not reload the page', () => {
    render(
      <DialogLine
        line={LINE}
        values={{}}
        onChange={vi.fn()}
        disabled={false}
        results={{}}
        locked={false}
        onEnter={vi.fn()}
      />,
    )
    // fireEvent's return value is false when the event's default was prevented.
    const notCancelled = fireEvent.keyDown(screen.getByTestId('blank-0'), { key: 'Enter' })
    expect(notCancelled).toBe(false)
  })

  it('does not throw when Enter is pressed and no onEnter handler is provided', () => {
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
    expect(() => fireEvent.keyDown(screen.getByTestId('blank-0'), { key: 'Enter' })).not.toThrow()
  })
})
